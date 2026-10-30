import type { AidokuInvokeArgs } from './runner';
import { buildFetchHeaders } from '../shared/fetch-headers';
import { bytesToBase64 as uint8ToBase64 } from '../shared/base64';
import { sharedFetch } from '../shared/http';
import { pause } from '../shared/net-policy';
import { sanitizeAidokuInvokeError } from './errors';
import { logAidokuWasm } from './wasm-log';

export type HostOutboundMessage =
  | {
      type: 'invoke';
      id: string;
      sourceId: string;
      method: string;
      args: unknown;
      settings?: Record<string, unknown>;
      sourceBaseUrl?: string;
    }
  | { type: 'fetch-response'; id: string; status: number; url: string; body: string; headers?: Record<string, string> }
  | { type: 'fetch-error'; id: string; message: string }
  | { type: 'reset-source'; sourceId: string };

export type HostInboundMessage =
  | { type: 'ready' }
  | { type: 'host-ready' }
  | { type: 'log'; level?: 'debug' | 'info' | 'warn' | 'error'; message: string }
  | {
      type: 'fetch';
      id: string;
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      sourceBaseUrl?: string;
      sourceId?: string;
    }
  | { type: 'result'; id: string; data: unknown }
  | { type: 'error'; id: string; message: string };

/** Stable message so UI can tell user-initiated cancel apart from real errors. */
export const AIDOKU_REQUEST_CANCELLED = 'Source request cancelled';
const AIDOKU_HOST_RESTARTED = 'Aidoku WASM host restarted';
const HOST_RESTART_MIN_INTERVAL_MS = 2000;
const MAX_HOST_RESTART_RETRIES = 2;

type PendingCall = {
  sourceId: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type InflightFetch = {
  sourceId?: string;
  generation: number;
  abort: AbortController;
  settled: boolean;
};

let postToHost: ((message: HostOutboundMessage) => void) | null = null;
let injectToHost: ((script: string) => void) | null = null;
let bridgeReady = false;
let hostReady = false;
let callCounter = 0;
const pendingCalls = new Map<string, PendingCall>();
const registeredWasmSources = new Set<string>();
const wasmRegistrationTasks = new Map<string, Promise<void>>();

const readyWaiters = new Set<{ resolve: () => void; reject: (error: Error) => void }>();

const INVOKE_TIMEOUT_MS = 60_000;
const INVOKE_HOME_TIMEOUT_MS = 90_000;
const WASM_CHUNK_SIZE = 280_000;

const sourceWatchers = new Map<string, number>();
const sourceRequestGeneration = new Map<string, number>();
const inflightFetches = new Map<string, InflightFetch>();

function canTalkToHost(): boolean {
  return injectToHost != null || postToHost != null;
}

function resolveReadyWaiters(): void {
  if (!bridgeReady || !hostReady || !canTalkToHost()) return;
  flushPendingSourceResets();
  for (const waiter of readyWaiters) {
    waiter.resolve();
  }
  readyWaiters.clear();
}

function injectScript(script: string): void {
  if (!injectToHost) {
    throw new Error('Aidoku WASM host injector is not ready');
  }
  injectToHost(`${script}\ntrue;`);
}

// RN WebView injectScript is faster for small payloads; huge fetch bodies go through postMessage.
function deliverToHost(message: HostOutboundMessage): void {
  if (message.type === 'fetch-response' || message.type === 'fetch-error') {
    const payload = JSON.stringify(message);
    if (payload.length > 400_000) {
      postToHost?.(message);
    } else {
      injectScript(
        `(function(){try{if(window.__aidokuHostDispatch){window.__aidokuHostDispatch(${payload});}}catch(e){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'log',level:'warn',message:'fetch dispatch failed: '+e}));}}})();`,
      );
    }
    return;
  }

  injectScript(
    `(function(){try{if(window.__aidokuHostDispatch){window.__aidokuHostDispatch(${JSON.stringify(message)});}}catch(e){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'log',message:'dispatch failed: '+e}));}}})();`,
  );
  postToHost?.(message);
}

export function setAidokuHostPoster(poster: ((message: HostOutboundMessage) => void) | null): void {
  postToHost = poster;
  resolveReadyWaiters();
}

export function setAidokuHostInjector(injector: ((script: string) => void) | null): void {
  injectToHost = injector;
  resolveReadyWaiters();
}

let hostRestarter: (() => void) | null = null;
let lastHostRestartAt = 0;

export function setAidokuHostRestarter(restarter: (() => void) | null): void {
  hostRestarter = restarter;
}

export function resetAidokuHostState(): void {
  hostReady = false;
  bridgeReady = false;
  registeredWasmSources.clear();
  wasmRegistrationTasks.clear();

  for (const [id, pending] of [...pendingCalls]) {
    pendingCalls.delete(id);
    pending.reject(new Error(AIDOKU_HOST_RESTARTED));
  }

  for (const [id, inflight] of [...inflightFetches]) {
    inflightFetches.delete(id);
    inflight.settled = true;
    inflight.abort.abort();
  }
}

export function requestAidokuHostRestart(reason: string): void {
  const now = Date.now();
  if (!hostRestarter || now - lastHostRestartAt < HOST_RESTART_MIN_INTERVAL_MS) return;
  lastHostRestartAt = now;
  logAidokuWasm('warn', `restarting host: ${reason}`);
  resetAidokuHostState();
  hostRestarter();
}

export function markAidokuBridgeReady(): void {
  hostReady = true;
  bridgeReady = true;
  resolveReadyWaiters();
}

const pendingSourceResets = new Set<string>();

function flushSourceReset(sourceId: string): void {
  if (!canTalkToHost()) {
    pendingSourceResets.add(sourceId);
    return;
  }
  pendingSourceResets.delete(sourceId);
  deliverToHost({ type: 'reset-source', sourceId });
}

function flushPendingSourceResets(): void {
  if (!canTalkToHost() || pendingSourceResets.size === 0) return;
  for (const sourceId of [...pendingSourceResets]) {
    deliverToHost({ type: 'reset-source', sourceId });
    pendingSourceResets.delete(sourceId);
  }
}

export function resetAidokuSourceRuntime(sourceId: string): void {
  flushSourceReset(sourceId);
}

export function isAidokuRequestCancelled(error: unknown): boolean {
  return error instanceof Error && error.message === AIDOKU_REQUEST_CANCELLED;
}

/** Bump watcher count while a screen still cares about this source's in-flight work. */
export function retainAidokuSourceRequests(sourceId: string): void {
  sourceWatchers.set(sourceId, (sourceWatchers.get(sourceId) ?? 0) + 1);
}

/** Last watcher leaving cancels pending invokes and fetches for that source. */
export function releaseAidokuSourceRequests(sourceId: string): void {
  const next = (sourceWatchers.get(sourceId) ?? 0) - 1;
  if (next > 0) {
    sourceWatchers.set(sourceId, next);
    return;
  }
  sourceWatchers.delete(sourceId);
  cancelAidokuSourceRequests(sourceId);
}

// Bump generation so in-flight retries abort without touching other sources.
export function cancelAidokuSourceRequests(sourceId: string): void {
  sourceRequestGeneration.set(sourceId, (sourceRequestGeneration.get(sourceId) ?? 0) + 1);

  for (const [id, pending] of [...pendingCalls]) {
    if (pending.sourceId !== sourceId) continue;
    pendingCalls.delete(id);
    pending.reject(new Error(AIDOKU_REQUEST_CANCELLED));
  }

  for (const [id, inflight] of [...inflightFetches]) {
    if (inflight.sourceId !== sourceId) continue;
    finishCancelledFetch(id, inflight);
  }

  logAidokuWasm('debug', `cancelled source requests ${sourceId}`);
}

function currentSourceGeneration(sourceId: string | undefined): number {
  if (!sourceId) return 0;
  return sourceRequestGeneration.get(sourceId) ?? 0;
}

function finishCancelledFetch(id: string, inflight: InflightFetch): void {
  inflight.abort.abort();
  if (inflight.settled) return;
  inflight.settled = true;
  inflightFetches.delete(id);
  if (!canTalkToHost()) return;
  deliverToHost({
    type: 'fetch-error',
    id,
    message: AIDOKU_REQUEST_CANCELLED,
  });
}

function isInflightCancelled(inflight: InflightFetch): boolean {
  if (inflight.abort.signal.aborted || inflight.settled) return true;
  if (!inflight.sourceId) return false;
  return currentSourceGeneration(inflight.sourceId) !== inflight.generation;
}

export function isAidokuBridgeReady(): boolean {
  return bridgeReady && hostReady && canTalkToHost();
}

export async function waitForAidokuBridgeReady(timeoutMs = 20000): Promise<void> {
  if (isAidokuBridgeReady()) {
    return;
  }

  await Promise.race([
    new Promise<void>((resolve, reject) => {
      readyWaiters.add({ resolve, reject });
    }),
    new Promise<void>((_, reject) => {
      setTimeout(() => {
        for (const waiter of readyWaiters) {
          waiter.reject(new Error('Aidoku WASM host timed out while starting'));
        }
        readyWaiters.clear();
        requestAidokuHostRestart('start timeout');
        reject(new Error('Aidoku WASM host timed out while starting'));
      }, timeoutMs);
    }),
  ]);

  if (!canTalkToHost()) {
    throw new Error('Aidoku WASM host is not ready');
  }
}

async function ensureWasmRegistered(sourceId: string, wasm: Uint8Array): Promise<void> {
  if (registeredWasmSources.has(sourceId)) return;

  const inflight = wasmRegistrationTasks.get(sourceId);
  if (inflight) {
    await inflight;
    return;
  }

  const task = registerWasmInHost(sourceId, wasm);
  wasmRegistrationTasks.set(sourceId, task);

  try {
    await task;
    registeredWasmSources.add(sourceId);
  } finally {
    wasmRegistrationTasks.delete(sourceId);
  }
}

// WASM binary is base64-chunked into the WebView because injectScript has size limits.
async function registerWasmInHost(sourceId: string, wasm: Uint8Array): Promise<void> {
  await pause(64);

  const encoded = uint8ToBase64(wasm);
  const key = JSON.stringify(sourceId);

  injectScript(`window.__aidokuWasmChunks=window.__aidokuWasmChunks||{};window.__aidokuWasmChunks[${key}]=[];`);

  for (let offset = 0; offset < encoded.length; offset += WASM_CHUNK_SIZE) {
    const chunk = encoded.slice(offset, offset + WASM_CHUNK_SIZE);
    injectScript(`window.__aidokuWasmChunks[${key}].push(${JSON.stringify(chunk)});`);
    await pause(0);
  }

  injectScript(
    `(function(){var key=${key};if(!window.__aidokuHost||!window.AidokuWasmHostBundle){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'log',message:'Aidoku host missing during registerWasm'}));}return;}var chunks=window.__aidokuWasmChunks[key]||[];window.__aidokuHost.registerWasm(key,window.AidokuWasmHostBundle.base64ToUint8(chunks.join('')));delete window.__aidokuWasmChunks[key];})();`,
  );

  await pause(32);
}

export async function callAidokuWasm(args: AidokuInvokeArgs): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await invokeAidokuWasmOnce(args);
    } catch (error) {
      const restarted = error instanceof Error && error.message === AIDOKU_HOST_RESTARTED;
      if (!restarted || attempt >= MAX_HOST_RESTART_RETRIES) throw error;
    }
  }
}

async function invokeAidokuWasmOnce(args: AidokuInvokeArgs): Promise<unknown> {
  await waitForAidokuBridgeReady();
  if (pendingSourceResets.has(args.sourceId)) {
    flushSourceReset(args.sourceId);
  }
  await ensureWasmRegistered(args.sourceId, args.wasm);

  const id = `call-${++callCounter}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCalls.delete(id);
      reject(new Error(`Aidoku WASM call timed out (${args.method})`));
    }, args.method === 'get_home' ? INVOKE_HOME_TIMEOUT_MS : INVOKE_TIMEOUT_MS);

    pendingCalls.set(id, {
      sourceId: args.sourceId,
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });

    deliverToHost({
      type: 'invoke',
      id,
      sourceId: args.sourceId,
      method: args.method,
      args: args.args,
      settings: args.settings,
      sourceBaseUrl: args.sourceBaseUrl,
    });
  });
}

export function handleHostMessage(message: HostInboundMessage): void {
  switch (message.type) {
    case 'ready':
      bridgeReady = true;
      resolveReadyWaiters();
      break;
    case 'host-ready':
      hostReady = true;
      bridgeReady = true;
      resolveReadyWaiters();
      break;
    case 'log':
      logAidokuWasm(message.level ?? 'info', message.message);
      break;
    case 'fetch':
      void performFetch(message);
      break;
    case 'result': {
      const pending = pendingCalls.get(message.id);
      if (!pending) return;
      pendingCalls.delete(message.id);
      pending.resolve(message.data);
      break;
    }
    case 'error': {
      const pending = pendingCalls.get(message.id);
      if (!pending) return;
      pendingCalls.delete(message.id);
      pending.reject(new Error(sanitizeAidokuInvokeError(message.message)));
      break;
    }
    default:
      break;
  }
}

async function performFetch(message: Extract<HostInboundMessage, { type: 'fetch' }>): Promise<void> {
  const inflight: InflightFetch = {
    sourceId: message.sourceId,
    generation: currentSourceGeneration(message.sourceId),
    abort: new AbortController(),
    settled: false,
  };
  inflightFetches.set(message.id, inflight);

  const settleError = (errorMessage: string) => {
    if (inflight.settled) return;
    inflight.settled = true;
    inflightFetches.delete(message.id);
    deliverToHost({
      type: 'fetch-error',
      id: message.id,
      message: errorMessage,
    });
  };

  const settleResponse = (
    status: number,
    url: string,
    body: string,
    headers: Record<string, string>,
  ) => {
    if (inflight.settled) return;
    inflight.settled = true;
    inflightFetches.delete(message.id);
    deliverToHost({
      type: 'fetch-response',
      id: message.id,
      status,
      url,
      body,
      headers,
    });
  };

  if (!canTalkToHost()) {
    settleError('Aidoku WASM host is not ready');
    return;
  }

  if (isInflightCancelled(inflight)) {
    settleError(AIDOKU_REQUEST_CANCELLED);
    return;
  }

  logAidokuWasm('debug', `fetch requested ${message.method ?? 'GET'} ${message.url}`);

  const method = message.method ?? 'GET';

  try {
    const result = await sharedFetch({
      url: message.url,
      method,
      headers: message.headers ?? {},
      body: message.body,
      sourceBaseUrl: message.sourceBaseUrl,
      signal: inflight.abort.signal,
      maxAttempts: 6,
      onLog: (level, text) => logAidokuWasm(level, text),
    });

    if (isInflightCancelled(inflight)) {
      settleError(AIDOKU_REQUEST_CANCELLED);
      return;
    }

    if (result.status >= 400) {
      const isMangadexBatch =
        result.status === 400 && message.url.includes('api.mangadex.org') && message.url.includes('ids[]=');
      logAidokuWasm(
        isMangadexBatch ? 'debug' : 'warn',
        `HTTP ${result.status} ${method} ${message.url} (${result.body.length} bytes)`,
      );
    } else {
      logAidokuWasm('debug', `fetch completed ${result.status} ${message.url} ${result.body.length} bytes`);
    }

    settleResponse(result.status, result.url, result.body, result.headers);
  } catch (error) {
    if (isInflightCancelled(inflight) || (error instanceof Error && error.name === 'AbortError')) {
      settleError(AIDOKU_REQUEST_CANCELLED);
      return;
    }
    logAidokuWasm('warn', `Fetch failed ${message.url} ${error instanceof Error ? error.message : String(error)}`);
    settleError(error instanceof Error ? error.message : 'Fetch failed');
  }
}

