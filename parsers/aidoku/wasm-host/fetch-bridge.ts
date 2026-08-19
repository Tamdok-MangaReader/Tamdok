import type { FetchBridge, FetchBridgeRequest, FetchBridgeResponse } from './env';

type PendingFetch = {
  resolve: (response: FetchBridgeResponse) => void;
  reject: (error: Error) => void;
};

export type ParentPoster = (message: Record<string, unknown>) => void;

/** Max fetch body size transferred through SharedArrayBuffer (8 MiB). */
export const FETCH_RESPONSE_SAB_SIZE = 8 * 1024 * 1024;
// Header: [state, status, urlLen, bodyLen] as i32 slots, then url+body bytes follow.
const FETCH_HEADER_SIZE = 32;

export enum FetchSabState {
  Pending = 0,
  Success = 1,
  Error = 2,
}

export function writeFetchSuccessSab(
  sab: SharedArrayBuffer,
  status: number,
  url: string,
  body: string,
): void {
  const view = new Int32Array(sab, 0, FETCH_HEADER_SIZE / 4);
  const bytes = new Uint8Array(sab);
  const encoder = new TextEncoder();
  const urlBytes = encoder.encode(url);
  const bodyBytes = encoder.encode(body);
  const payloadOffset = FETCH_HEADER_SIZE + urlBytes.length;

  if (payloadOffset + bodyBytes.length > sab.byteLength) {
    writeFetchErrorSab(sab, 'Fetch response exceeded SharedArrayBuffer capacity');
    return;
  }

  bytes.set(urlBytes, FETCH_HEADER_SIZE);
  bytes.set(bodyBytes, payloadOffset);
  view[1] = status;
  view[2] = urlBytes.length;
  view[3] = bodyBytes.length;
  Atomics.store(view, 0, FetchSabState.Success);
}

export function writeFetchErrorSab(sab: SharedArrayBuffer, message: string): void {
  const view = new Int32Array(sab, 0, FETCH_HEADER_SIZE / 4);
  const bytes = new Uint8Array(sab);
  const messageBytes = new TextEncoder().encode(message.slice(0, 512));

  bytes.set(messageBytes, FETCH_HEADER_SIZE);
  view[2] = messageBytes.length;
  view[3] = 0;
  Atomics.store(view, 0, FetchSabState.Error);
}

export function readFetchSabResponse(id: string, responseSab: SharedArrayBuffer): FetchBridgeResponse {
  const header = new Int32Array(responseSab, 0, FETCH_HEADER_SIZE / 4);
  const state = Atomics.load(header, 0);

  if (state === FetchSabState.Error) {
    const messageLength = header[2] ?? 0;
    const message = new TextDecoder().decode(new Uint8Array(responseSab, FETCH_HEADER_SIZE, messageLength));
    throw new Error(message || 'Fetch failed');
  }

  if (state !== FetchSabState.Success) {
    throw new Error('Fetch timed out');
  }

  const status = header[1] ?? 0;
  const urlLength = header[2] ?? 0;
  const bodyLength = header[3] ?? 0;
  const decoder = new TextDecoder();
  const url = decoder.decode(new Uint8Array(responseSab, FETCH_HEADER_SIZE, urlLength));
  const body = decoder.decode(new Uint8Array(responseSab, FETCH_HEADER_SIZE + urlLength, bodyLength));

  return { id, status, url, body, headers: {} };
}

export function waitForFetchSab(responseSab: SharedArrayBuffer, timeoutMs: number): FetchSabState {
  const header = new Int32Array(responseSab, 0, FETCH_HEADER_SIZE / 4);
  const deadline = Date.now() + timeoutMs;

  while (Atomics.load(header, 0) === FetchSabState.Pending && Date.now() < deadline) {
    Atomics.wait(header, 0, FetchSabState.Pending, Math.min(1_000, deadline - Date.now()));
  }

  return Atomics.load(header, 0) as FetchSabState;
}

export function tryCreateSharedArrayBuffer(byteLength = 4): SharedArrayBuffer | null {
  try {
    if (typeof SharedArrayBuffer === 'undefined') return null;
    const sab = new SharedArrayBuffer(byteLength);
    return sab.byteLength === byteLength ? sab : null;
  } catch {
    return null;
  }
}

// Pool size matches max concurrent WASM fetches; try smaller buffers if 8 MiB SAB fails.
export function createFetchSabPool(count = 8, byteLength = FETCH_RESPONSE_SAB_SIZE): SharedArrayBuffer[] {
  const pool: SharedArrayBuffer[] = [];
  const sizes = [byteLength, 4 * 1024 * 1024, 2 * 1024 * 1024, 1024 * 1024];

  for (let index = 0; index < count; index++) {
    let sab: SharedArrayBuffer | null = null;
    for (const size of sizes) {
      sab = tryCreateSharedArrayBuffer(size);
      if (sab) break;
    }
    if (sab) pool.push(sab);
  }

  return pool;
}

const workerFetchSabPool: SharedArrayBuffer[] = [];

export function initWorkerFetchSabPool(sabs: SharedArrayBuffer[]): void {
  workerFetchSabPool.length = 0;
  workerFetchSabPool.push(...sabs);
}

export function workerFetchSabPoolSize(): number {
  return workerFetchSabPool.length;
}

function resetFetchSab(sab: SharedArrayBuffer): void {
  Atomics.store(new Int32Array(sab, 0, FETCH_HEADER_SIZE / 4), 0, FetchSabState.Pending);
}

function acquireWorkerFetchSab(): SharedArrayBuffer {
  const sab = workerFetchSabPool.pop();
  if (!sab) {
    throw new Error('Aidoku fetch buffer pool exhausted');
  }
  resetFetchSab(sab);
  return sab;
}

function releaseWorkerFetchSab(sab: SharedArrayBuffer): void {
  resetFetchSab(sab);
  workerFetchSabPool.push(sab);
}

function isRnWebView(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView !== 'undefined'
  );
}

function isHttpOrigin(): boolean {
  try {
    return window.location.protocol === 'http:' || window.location.protocol === 'https:';
  } catch {
    return false;
  }
}

function sendWithSyncXhr(request: FetchBridgeRequest): FetchBridgeResponse {
  const xhr = new XMLHttpRequest();
  xhr.open(request.method, request.url, false);
  xhr.timeout = request.timeoutMs ?? 60_000;
  Object.entries(request.headers).forEach(([key, value]) => {
    xhr.setRequestHeader(key, value);
  });
  if (request.body != null) {
    xhr.send(request.body);
  } else {
    xhr.send();
  }

  if (xhr.status === 0) {
    throw new Error('Network request failed');
  }

  return {
    id: request.id,
    status: xhr.status,
    url: xhr.responseURL || request.url,
    body: xhr.responseText,
    headers: parseXhrHeaders(xhr.getAllResponseHeaders()),
  };
}

// Blocks the WASM thread until RN returns fetch data (SAB Atomics or sync XHR fallback).
export class SyncFetchBridge implements FetchBridge {
  private pending = new Map<string, PendingFetch>();
  private counter = 0;

  constructor(private postToParent: ParentPoster) {}

  send(request: Omit<FetchBridgeRequest, 'id'> & { id?: string }): FetchBridgeResponse {
    return this.sendAll([{ ...request, id: request.id ?? `fetch-${++this.counter}` }])[0]!;
  }

  sendAll(requests: Array<Omit<FetchBridgeRequest, 'id'> & { id?: string }>): FetchBridgeResponse[] {
    if (requests.length === 0) return [];
    if (requests.length === 1) {
      const fullRequest: FetchBridgeRequest = { ...requests[0]!, id: requests[0]!.id ?? `fetch-${++this.counter}` };
      return [this.sendOne(fullRequest)];
    }

    const fullRequests = requests.map((request) => ({
      ...request,
      id: request.id ?? `fetch-${++this.counter}`,
    })) as FetchBridgeRequest[];

    // Inside RN WebView, COOP/COEP is usually missing so sync XHR is the reliable path.
    if (isRnWebView()) {
      return fullRequests.map((request) => sendWithSyncXhr(request));
    }

    if (typeof SharedArrayBuffer !== 'undefined') {
      try {
        return this.sendAllWithAtomics(fullRequests);
      } catch {
        // Fall back to sync XHR below.
      }
    }

    return fullRequests.map((request) => sendWithSyncXhr(request));
  }

  private sendOne(request: FetchBridgeRequest): FetchBridgeResponse {
    if (isRnWebView()) {
      return sendWithSyncXhr(request);
    }

    if (typeof SharedArrayBuffer !== 'undefined') {
      try {
        return this.sendWithAtomics(request);
      } catch {
        // Fall back to sync XHR below.
      }
    }

    return sendWithSyncXhr(request);
  }

  private sendAllWithAtomics(requests: FetchBridgeRequest[]): FetchBridgeResponse[] {
    type PendingJob = {
      request: FetchBridgeRequest;
      sab: SharedArrayBuffer;
      flag: Int32Array;
    };

    const jobs: PendingJob[] = requests.map((request) => {
      const sab = new SharedArrayBuffer(4);
      const flag = new Int32Array(sab);
      this.pending.set(request.id, {
        resolve: (value) => {
          (request as FetchBridgeRequest & { __response?: FetchBridgeResponse }).__response = value;
          Atomics.store(flag, 0, 1);
          Atomics.notify(flag, 0, 1);
        },
        reject: (error) => {
          (request as FetchBridgeRequest & { __error?: Error }).__error = error;
          Atomics.store(flag, 0, 2);
          Atomics.notify(flag, 0, 1);
        },
      });

      this.postToParent({
        type: 'fetch',
        id: request.id,
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: request.body,
        sourceBaseUrl: request.sourceBaseUrl,
        sourceId: request.sourceId,
      });

      return { request, sab, flag };
    });

    const responses: FetchBridgeResponse[] = [];
    for (const job of jobs) {
      const timeoutMs = job.request.timeoutMs ?? 60_000;
      Atomics.wait(job.flag, 0, 0, timeoutMs);
      this.pending.delete(job.request.id);

      const error = (job.request as FetchBridgeRequest & { __error?: Error }).__error;
      if (error) throw error;

      const response = (job.request as FetchBridgeRequest & { __response?: FetchBridgeResponse }).__response;
      if (!response) {
        throw new Error('Fetch timed out');
      }
      responses.push(response);
    }

    return responses;
  }

  handleParentMessage(message: Record<string, unknown>): boolean {
    if (message.type === 'fetch-response') {
      const pending = this.pending.get(String(message.id));
      if (!pending) return false;
      this.pending.delete(String(message.id));
      pending.resolve({
        id: String(message.id),
        status: Number(message.status),
        url: String(message.url),
        body: String(message.body),
        headers: (message.headers as Record<string, string> | undefined) ?? {},
      });
      return true;
    }

    if (message.type === 'fetch-error') {
      const pending = this.pending.get(String(message.id));
      if (!pending) return false;
      this.pending.delete(String(message.id));
      pending.reject(new Error(String(message.message ?? 'Fetch failed')));
      return true;
    }

    return false;
  }

  private sendWithAtomics(request: FetchBridgeRequest, sab = new SharedArrayBuffer(4)): FetchBridgeResponse {
    const flag = new Int32Array(sab);
    let response: FetchBridgeResponse | null = null;
    let error: Error | null = null;

    this.pending.set(request.id, {
      resolve: (value) => {
        response = value;
        Atomics.store(flag, 0, 1);
        Atomics.notify(flag, 0, 1);
      },
      reject: (err) => {
        error = err;
        Atomics.store(flag, 0, 2);
        Atomics.notify(flag, 0, 1);
      },
    });

    this.postToParent({
      type: 'fetch',
      id: request.id,
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body,
      sourceBaseUrl: request.sourceBaseUrl,
      sourceId: request.sourceId,
    });

    Atomics.wait(flag, 0, 0, request.timeoutMs ?? 60_000);
    this.pending.delete(request.id);

    if (error) throw error;
    if (!response) {
      throw new Error('Fetch timed out');
    }
    return response;
  }
}

function parseXhrHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  raw
    .trim()
    .split(/[\r\n]+/)
    .filter(Boolean)
    .forEach((line) => {
      const index = line.indexOf(':');
      if (index === -1) return;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
    });
  return headers;
}

function tryCreateLocalSharedArrayBuffer(byteLength = 4): SharedArrayBuffer | null {
  return tryCreateSharedArrayBuffer(byteLength);
}

function waitForFetchMessage(id: string, timeoutMs: number, responseSab: SharedArrayBuffer): FetchBridgeResponse {
  const state = waitForFetchSab(responseSab, timeoutMs);
  if (state === FetchSabState.Pending) {
    throw new Error('Fetch timed out');
  }
  return readFetchSabResponse(id, responseSab);
}

// Worker posts fetch jobs to the main thread and blocks on a pooled response SAB.
export function createWorkerParentFetchBridge(): FetchBridge {
  let counter = 0;

  const bridge: FetchBridge = {
    send(request) {
      return bridge.sendAll([{ ...request, id: request.id ?? `fetch-${++counter}` }])[0]!;
    },

    sendAll(requests) {
      if (requests.length === 0) return [];

      const jobs = requests.map((request) => {
        const id = request.id ?? `fetch-${++counter}`;
        const timeoutMs = request.timeoutMs ?? 60_000;
        const responseSab = acquireWorkerFetchSab();
        self.postMessage({
          type: 'fetch',
          id,
          responseSab,
          url: request.url,
          method: request.method,
          headers: request.headers,
          body: request.body,
          timeoutMs,
          sourceBaseUrl: request.sourceBaseUrl,
          sourceId: request.sourceId,
        });
        return { id, responseSab, timeoutMs };
      });

      try {
        return jobs.map(({ id, responseSab, timeoutMs }) => waitForFetchMessage(id, timeoutMs, responseSab));
      } finally {
        jobs.forEach(({ responseSab }) => releaseWorkerFetchSab(responseSab));
      }
    },
  };

  return bridge;
}

export function createWorkerFetchBridge(): FetchBridge {
  if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    return createWorkerParentFetchBridge();
  }

  if (tryCreateLocalSharedArrayBuffer() != null) {
    return createWorkerSharedArrayBufferFetchBridge();
  }

  let counter = 0;
  return {
    send(request) {
      const id = request.id ?? `fetch-${++counter}`;
      return sendWithSyncXhr({ ...request, id });
    },
    sendAll(requests) {
      return requests.map((request) => {
        const id = request.id ?? `fetch-${++counter}`;
        return sendWithSyncXhr({ ...request, id });
      });
    },
  };
}

function createWorkerSharedArrayBufferFetchBridge(): FetchBridge {
  let counter = 0;
  const pending = new Map<string, PendingFetch>();

  self.addEventListener('message', (event) => {
    const message = event.data as Record<string, unknown>;
    if (message.type === 'fetch-response') {
      pending.get(String(message.id))?.resolve({
        id: String(message.id),
        status: Number(message.status),
        url: String(message.url),
        body: String(message.body),
        headers: (message.headers as Record<string, string> | undefined) ?? {},
      });
      pending.delete(String(message.id));
    }
    if (message.type === 'fetch-error') {
      pending.get(String(message.id))?.reject(new Error(String(message.message ?? 'Fetch failed')));
      pending.delete(String(message.id));
    }
  });

  return {
    send(request) {
      const id = request.id ?? `fetch-${++counter}`;
      return sendOneShared(id, request);
    },
    sendAll(requests) {
      if (requests.length === 0) return [];

      const jobs = requests.map((request) => {
        const id = request.id ?? `fetch-${++counter}`;
        const sab = new SharedArrayBuffer(4);
        const flag = new Int32Array(sab);
        let response: FetchBridgeResponse | null = null;
        let error: Error | null = null;

        pending.set(id, {
          resolve: (value) => {
            response = value;
            Atomics.store(flag, 0, 1);
            Atomics.notify(flag, 0, 1);
          },
          reject: (err) => {
            error = err;
            Atomics.store(flag, 0, 2);
            Atomics.notify(flag, 0, 1);
          },
        });

        self.postMessage({
          type: 'fetch',
          id,
          url: request.url,
          method: request.method,
          headers: request.headers,
          body: request.body,
          sourceBaseUrl: request.sourceBaseUrl,
          sourceId: request.sourceId,
          sab,
        });

        return { id, flag, timeoutMs: request.timeoutMs ?? 60_000, get response() { return response; }, get error() { return error; } };
      });

      const responses: FetchBridgeResponse[] = [];
      for (const job of jobs) {
        Atomics.wait(job.flag, 0, 0, job.timeoutMs);
        pending.delete(job.id);
        if (job.error) throw job.error;
        if (!job.response) throw new Error('Fetch timed out');
        responses.push(job.response);
      }
      return responses;
    },
  };

  function sendOneShared(id: string, request: Omit<FetchBridgeRequest, 'id'>): FetchBridgeResponse {
    const sab = new SharedArrayBuffer(4);
    const flag = new Int32Array(sab);
    let response: FetchBridgeResponse | null = null;
    let error: Error | null = null;

    pending.set(id, {
      resolve: (value) => {
        response = value;
        Atomics.store(flag, 0, 1);
        Atomics.notify(flag, 0, 1);
      },
      reject: (err) => {
        error = err;
        Atomics.store(flag, 0, 2);
        Atomics.notify(flag, 0, 1);
      },
    });

    self.postMessage({
      type: 'fetch',
      id,
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body,
      sourceBaseUrl: request.sourceBaseUrl,
      sourceId: request.sourceId,
      sab,
    });

    Atomics.wait(flag, 0, 0, request.timeoutMs ?? 60_000);
    pending.delete(id);
    if (error) throw error;
    if (!response) throw new Error('Fetch timed out');
    return response;
  }
}
