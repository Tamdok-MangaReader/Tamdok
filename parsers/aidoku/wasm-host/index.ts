import { SyncFetchBridge, type ParentPoster } from './fetch-bridge';
import { WasmEnv } from './env';
import { hydrateWasmDefaults } from './imports/defaults';
import { base64ToUint8, invokeExport, resetWasmSourceRuntime } from './runner';

export type HostMessage =
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

export type HostOptions = {
  postToParent: ParentPoster;
  onReady?: () => void;
};

export type AidokuHost = {
  invoke: (
    sourceId: string,
    wasm: Uint8Array,
    method: string,
    args: unknown,
    invokeId: string,
    env?: WasmEnv,
  ) => Promise<unknown>;
  registerWasm: (sourceId: string, wasm: Uint8Array) => void;
  resetSource: (sourceId: string) => void;
  handleParentMessage: (message: HostMessage | Record<string, unknown>) => void;
  handleInvokeMessage: (message: Extract<HostMessage, { type: 'invoke' }>) => Promise<void>;
};

export function createHost(options: HostOptions): AidokuHost {
  const fetchBridge = new SyncFetchBridge(options.postToParent);
  const wasmCache = new Map<string, Uint8Array>();
  const envCache = new Map<string, WasmEnv>();

  const host: AidokuHost = {
    registerWasm(sourceId, wasm) {
      wasmCache.set(sourceId, wasm);
    },

    resetSource(sourceId) {
      resetWasmSourceRuntime(sourceId);
      envCache.delete(sourceId);
    },

    async invoke(sourceId, wasm, method, args, invokeId, env) {
      return invokeExport({ sourceId, wasm, postToParent: options.postToParent }, method, args, env);
    },

    handleParentMessage(message) {
      fetchBridge.handleParentMessage(message);
    },

    async handleInvokeMessage(message) {
      const wasm = wasmCache.get(message.sourceId);
      if (!wasm) {
        throw new Error('Aidoku WASM module is not registered for this source');
      }

      let env = envCache.get(message.sourceId);
      if (!env) {
        env = new WasmEnv(fetchBridge);
        env.sourceId = message.sourceId;
        envCache.set(message.sourceId, env);
      }
      env.sourceId = message.sourceId;

      if (typeof message.sourceBaseUrl === 'string' && message.sourceBaseUrl) {
        env.sourceBaseUrl = message.sourceBaseUrl;
      }
      if (message.settings && typeof message.settings === 'object') {
        hydrateWasmDefaults(env, message.settings);
      }

      try {
        const data = await host.invoke(message.sourceId, wasm, message.method, message.args, message.id, env);
        options.postToParent({ type: 'result', id: message.id, data });
      } catch (error) {
        options.postToParent({
          type: 'error',
          id: message.id,
          message: error instanceof Error ? error.message : 'Invoke failed',
        });
        throw error;
      }
    },
  };

  options.onReady?.();
  return host;
}

export { base64ToUint8, resetWasmSourceRuntime } from './runner';
export {
  writeFetchSuccessSab,
  writeFetchErrorSab,
  createFetchSabPool,
  tryCreateSharedArrayBuffer,
  FetchSabState,
} from './fetch-bridge';
export { WasmEnv, GlobalStore } from './env';
export type { Rid, Ptr, FFIResult } from './env';
