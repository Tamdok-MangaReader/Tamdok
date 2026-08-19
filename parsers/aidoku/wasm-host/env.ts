import type { PostcardHomeLayout } from './schemas';

export type Rid = number;
export type Ptr = number;
export type FFIResult = number;

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

  writeStdout(text: string): void {
    this.stdout += text;
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
  readResultBytes(ptr: Ptr): Uint8Array {
    const len = this.readI32(ptr);
    if (len === -1) {
      const realLen = this.readI32(ptr + 8);
      return this.readBytes(ptr + 12, realLen - 12);
    }
    return this.readBytes(ptr + 8, len - 8);
  }

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
