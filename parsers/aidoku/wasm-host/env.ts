import type { PostcardHomeLayout } from './schemas';

// Aidoku's host ABI never passes complex objects into WASM. Instead the host keeps objects in a
// handle table and gives the module small integers: a `Rid` (resource id). Raw pointers into the
// module's own linear memory are `Ptr`s; `FFIResult` is the integer status/length a host import returns.
export type Rid = number;
export type Ptr = number;
export type FFIResult = number;

// Everything that can live behind a Rid: strings, postcard-encoded values, in-progress HTTP
// requests, parsed HTML documents/elements/nodes (and lists of them) and decoded image data.
export type StoreItem =
  | { kind: 'string'; value: string }
  | { kind: 'encoded'; value: Uint8Array }
  | { kind: 'request'; value: NetRequestState }
  | { kind: 'htmlDocument'; value: HtmlDocumentState }
  | { kind: 'htmlElement'; value: HtmlElementState }
  | { kind: 'htmlNode'; value: HtmlNodeState }
  | { kind: 'htmlNodeList'; value: HtmlNodeState[] }
  | { kind: 'htmlElementList'; value: HtmlElementState[] }
  | { kind: 'imageData'; value: ImageDataState };

// Mutable state of a request while the source configures it; `response` is filled after `send`.
export type NetRequestState = {
  method: HttpMethod;
  url?: string;
  headers: Record<string, string>;
  body?: Uint8Array;
  timeout?: number;
  response?: NetResponseState;
};

export type NetResponseState = {
  url: string;
  status: number;
  headers: Record<string, string>;
  data: Uint8Array;
};

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'HEAD' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'CONNECT' | 'TRACE';

export type HtmlDocumentState = {
  document: Document;
  baseUri?: string;
};

export type HtmlNodeState = {
  document: Document;
  node: Node;
  baseUri?: string;
};

export type HtmlElementState = HtmlNodeState;

export type ImageDataState = {
  data: Uint8Array;
  width: number;
  height: number;
};

export type DefaultValue =
  | { kind: 'data'; value: Uint8Array }
  | { kind: 'bool'; value: boolean }
  | { kind: 'int'; value: number }
  | { kind: 'float'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'stringArray'; value: string[] }
  | { kind: 'null' };

// In-memory implementation of Aidoku's `defaults` import (per-source settings storage).
// Values are hydrated from the app's saved settings before each invoke (see imports/defaults.ts).
export class UserDefaults {
  private values = new Map<string, DefaultValue>();

  get(key: string): DefaultValue | undefined {
    return this.values.get(key);
  }

  set(key: string, value: DefaultValue): void {
    this.values.set(key, value);
  }
}

// Simple 1-based handle table shared by all WASM host imports for one invoke.
// Handle table shared by all host imports during one invocation. Rids start at 1 (0 means "none"
// in the ABI) and the counter resets once the table is empty.
export class GlobalStore {
  private pointer: Rid = 1;
  private storage = new Map<Rid, StoreItem>();

  store(item: StoreItem): Rid {
    const rid = this.pointer;
    this.storage.set(rid, item);
    this.pointer += 1;
    return rid;
  }

  storeEncoded(bytes: Uint8Array): Rid {
    return this.store({ kind: 'encoded', value: bytes });
  }

  get(rid: Rid): StoreItem | undefined {
    return this.storage.get(rid);
  }

  getMut(rid: Rid): StoreItem | undefined {
    return this.storage.get(rid);
  }

  remove(rid: Rid): void {
    this.storage.delete(rid);
    if (this.storage.size === 0) {
      this.pointer = 1;
    }
  }
}

// How the host performs HTTP. Implemented in fetch-bridge.ts. Both methods are SYNCHRONOUS
// because WASM imports cannot await.
export type FetchBridgeRequest = {
  id: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  sourceBaseUrl?: string;
  sourceId?: string;
};

export type FetchBridgeResponse = {
  id: string;
  status: number;
  url: string;
  body: string;
  headers?: Record<string, string>;
};

export type FetchBridge = {
  send: (request: FetchBridgeRequest) => FetchBridgeResponse;
  /** Fire requests concurrently (Aidoku Request::send_all semantics). */
  sendAll: (requests: FetchBridgeRequest[]) => FetchBridgeResponse[];
};

// Everything the host imports need for one source: the module's memory, the handle table,
// settings, the fetch bridge and scratch state for partial results. The `read*`/`write*` helpers
// are thin little-endian accessors over WASM linear memory.
export class WasmEnv {
  memory: WebAssembly.Memory | null = null;
  store = new GlobalStore();
  defaults = new UserDefaults();
  stdout = '';
  sourceBaseUrl?: string;
  sourceId?: string;
  fetchBridge: FetchBridge;
  homePartialLayout: PostcardHomeLayout | null = null;
  partialMangaResults: unknown[] = [];

  constructor(fetchBridge: FetchBridge) {
    this.fetchBridge = fetchBridge;
  }

  // Captures output from the module's print/log imports; capped so a chatty source cannot grow memory.
  writeStdout(text: string): void {
    this.stdout += text;
    if (this.stdout.length > 16_384) {
      this.stdout = this.stdout.slice(-8_192);
    }
  }

  readU32(ptr: Ptr): number {
    const view = this.memoryView();
    return view.getUint32(ptr, true);
  }

  readI32(ptr: Ptr): number {
    const view = this.memoryView();
    return view.getInt32(ptr, true);
  }

  readF64(ptr: Ptr): number {
    const view = this.memoryView();
    return view.getFloat64(ptr, true);
  }

  readBytes(ptr: Ptr, len: number): Uint8Array {
    if (len <= 0) return new Uint8Array();
    const view = this.memoryView();
    const copy = new Uint8Array(len);
    copy.set(new Uint8Array(view.buffer, view.byteOffset + ptr, len));
    return copy;
  }

  readValues(ptr: Ptr, len: number): number[] {
    const view = this.memoryView();
    const values: number[] = [];
    for (let i = 0; i < len; i++) {
      values.push(view.getInt32(ptr + i * 4, true));
    }
    return values;
  }

  readString(ptr: Ptr, len: number): string {
    if (len === 0) return '';
    const bytes = this.readBytes(ptr, len);
    return new TextDecoder().decode(bytes);
  }

  // Aidoku buffers start with an 8-byte header whose first i32 is the total length (header included),
// so the payload starts 8 bytes in.
  readItemBytes(ptr: Ptr): Uint8Array {
    const len = this.readI32(ptr);
    return this.readBytes(ptr + 8, len - 8);
  }

  writeBuffer(ptr: Ptr, bytes: Uint8Array): void {
    const view = this.memoryView();
    new Uint8Array(view.buffer, view.byteOffset + ptr, bytes.length).set(bytes);
  }

  writeValues(ptr: Ptr, values: number[]): void {
    const view = this.memoryView();
    values.forEach((value, index) => {
      view.setInt32(ptr + index * 4, value, true);
    });
  }

  /** Read Aidoku FFI result blob from linear memory (see decodeResult in runner.ts). */
  // Result blobs have an optional extended header when len == -1 (error string): the real length is
  // stored 8 bytes in and the payload starts 12 bytes in.
  readResultBytes(ptr: Ptr): Uint8Array {
    const len = this.readI32(ptr);
    if (len === -1) {
      const realLen = this.readI32(ptr + 8);
      return this.readBytes(ptr + 12, realLen - 12);
    }
    return this.readBytes(ptr + 8, len - 8);
  }

  // `memory.buffer` is replaced when WASM memory grows, so a fresh DataView is created on each access.
  private memoryView(): DataView {
    if (!this.memory) {
      throw new Error('WASM memory not initialized');
    }
    return new DataView(this.memory.buffer);
  }
}

export function asEncoded(item: StoreItem | undefined): Uint8Array | undefined {
  if (!item) return undefined;
  if (item.kind === 'encoded') return item.value;
  if (item.kind === 'string') return new TextEncoder().encode(item.value);
  return undefined;
}

export function asRequest(item: StoreItem | undefined): NetRequestState | undefined {
  return item?.kind === 'request' ? item.value : undefined;
}
