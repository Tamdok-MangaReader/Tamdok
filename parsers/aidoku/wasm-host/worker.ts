import { createWorkerParentFetchBridge, initWorkerFetchSabPool } from './fetch-bridge';
import { WasmEnv } from './env';
import { hydrateWasmDefaults } from './imports/defaults';
import { invokeExport, resetWasmSourceRuntime } from './runner';

declare const self: Worker;

let fetchBridge: ReturnType<typeof createWorkerParentFetchBridge> | null = null;
const wasmCache = new Map<string, Uint8Array>();
const envCache = new Map<string, WasmEnv>();

function getFetchBridge() {
  if (!fetchBridge) {
    throw new Error('Aidoku fetch pool is not initialized');
  }
  return fetchBridge;
}

function getEnv(sourceId: string): WasmEnv {
  let env = envCache.get(sourceId);
  if (!env) {
    env = new WasmEnv(getFetchBridge());
    env.sourceId = sourceId;
    envCache.set(sourceId, env);
  }
  env.sourceId = sourceId;
  return env;
}

// One invoke at a time per source; WASM module state is not re-entrant.
const invokeQueues = new Map<string, Promise<unknown>>();

function runQueued<T>(sourceId: string, task: () => Promise<T>): Promise<T> {
  const previous = invokeQueues.get(sourceId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  invokeQueues.set(
    sourceId,
    current.then(
      () => undefined,
      () => undefined,
    ),
  );
  return current;
}

self.addEventListener('message', (event: MessageEvent<Record<string, unknown>>) => {
  const message = event.data;
  if (!message?.type) return;

  if (message.type === 'fetch-pool-init') {
    const sabs = message.sabs;
    if (Array.isArray(sabs)) {
      initWorkerFetchSabPool(sabs.filter((item): item is SharedArrayBuffer => item instanceof SharedArrayBuffer));
      fetchBridge = createWorkerParentFetchBridge();
      self.postMessage({ type: 'log', level: 'debug', message: 'fetch sab pool ready: ' + sabs.length });
    }
    return;
  }

  if (message.type === 'register-wasm') {
    if (message.wasm instanceof ArrayBuffer) {
      wasmCache.set(String(message.sourceId), new Uint8Array(message.wasm));
    }
    return;
  }

  if (message.type === 'reset-source') {
    const sourceId = String(message.sourceId);
    resetWasmSourceRuntime(sourceId);
    envCache.delete(sourceId);
    return;
  }

  if (message.type !== 'invoke') return;

  const sourceId = String(message.sourceId);
  const invokeId = String(message.id);

  void runQueued(sourceId, async () => {
    self.postMessage({ type: 'log', level: 'debug', message: 'worker invoke: ' + String(message.method) });

    if (message.wasm instanceof ArrayBuffer) {
      wasmCache.set(sourceId, new Uint8Array(message.wasm));
    }

    const wasm = wasmCache.get(sourceId);
    if (!wasm) {
      self.postMessage({
        type: 'error',
        id: invokeId,
        message: 'Aidoku WASM module is not loaded in worker',
      });
      return;
    }

    const env = getEnv(sourceId);
    if (typeof message.sourceBaseUrl === 'string' && message.sourceBaseUrl) {
      env.sourceBaseUrl = message.sourceBaseUrl;
    }
    if (message.settings && typeof message.settings === 'object') {
      hydrateWasmDefaults(env, message.settings as Record<string, unknown>);
    }

    try {
      const data = await invokeExport(
        {
          sourceId,
          wasm,
        },
        String(message.method),
        message.args,
        env,
      );
      self.postMessage({ type: 'result', id: invokeId, data });
    } catch (error) {
      self.postMessage({
        type: 'error',
        id: invokeId,
        message: error instanceof Error ? error.message : 'Invoke failed',
      });
    }
  });
});

export {};
