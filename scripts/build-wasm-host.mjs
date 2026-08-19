import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

// Bundles the Aidoku WASM host for the hidden WebView (main thread + worker).
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hostDir = join(root, 'parsers/aidoku/wasm-host');
const assetsDir = join(root, 'assets');

mkdirSync(assetsDir, { recursive: true });

const shared = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020', 'chrome100', 'ios15'],
  logLevel: 'info',
};

const mainOut = join(assetsDir, 'aidoku-wasm-host.main.js');
const bundleOut = join(assetsDir, 'aidoku-wasm-host.bundle');
const workerOut = join(assetsDir, 'aidoku-wasm-host.worker.bundle');

await esbuild.build({
  ...shared,
  entryPoints: [join(hostDir, 'index.ts')],
  outfile: mainOut,
  globalName: 'AidokuWasmHostBundle',
  define: {
    'globalThis.AIDOKU_WASM_WORKER_URL': 'undefined',
  },
});

await esbuild.build({
  ...shared,
  entryPoints: [join(hostDir, 'worker.ts')],
  outfile: workerOut,
});

const mainBundle = readFileSync(mainOut, 'utf8');

const bootstrap = `${mainBundle}
(function bootstrapAidokuHost() {
  function post(message) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }
    } catch (error) {
      /* ignore post failures */
    }
  }
  function notifyReady() {
    post({ type: 'host-ready' });
  }
  var bootstrapFinished = false;
  function finishBootstrap() {
    if (bootstrapFinished) return;
    bootstrapFinished = true;
    post({ type: 'log', level: 'info', message: 'bootstrap ready' });
    notifyReady();
  }
  try {
    post({ type: 'log', level: 'debug', message: 'bootstrap start crossOriginIsolated=' + self.crossOriginIsolated });
    if (window.ReactNativeWebView) {
      globalThis.AIDOKU_WASM_WORKER_URL =
        window.__AIDOKU_WORKER_URL || (window.location.protocol === 'file:' ? './host.worker.js' : undefined);
    }
    if (typeof AidokuWasmHostBundle === 'undefined' || !AidokuWasmHostBundle.createHost) {
      throw new Error('AidokuWasmHostBundle is missing');
    }
    var worker = null;
    window.__aidokuFetchPending = window.__aidokuFetchPending || {};
    function forwardFetchToNative(data) {
      post({
        type: 'fetch',
        id: data.id,
        url: data.url,
        method: data.method,
        headers: data.headers,
        body: data.body,
        sourceBaseUrl: data.sourceBaseUrl,
        sourceId: data.sourceId,
      });
    }
    if (globalThis.AIDOKU_WASM_WORKER_URL && self.crossOriginIsolated) {
      var fetchSabPool = AidokuWasmHostBundle.createFetchSabPool
        ? AidokuWasmHostBundle.createFetchSabPool(8)
        : [];
      if (fetchSabPool.length === 0) {
        post({ type: 'log', level: 'warn', message: 'fetch sab pool unavailable despite cross-origin isolation' });
        globalThis.AIDOKU_WASM_WORKER_URL = undefined;
      } else {
        worker = new Worker(globalThis.AIDOKU_WASM_WORKER_URL);
        worker.postMessage({ type: 'fetch-pool-init', sabs: fetchSabPool });
        post({ type: 'log', level: 'info', message: 'wasm host mode: worker + SharedArrayBuffer pool=' + fetchSabPool.length });
      }
    } else if (globalThis.AIDOKU_WASM_WORKER_URL) {
      post({ type: 'log', level: 'warn', message: 'cross-origin isolation unavailable, worker disabled' });
      globalThis.AIDOKU_WASM_WORKER_URL = undefined;
    }
    if (!worker) {
      post({ type: 'log', level: 'info', message: 'wasm host mode: main-thread invoke' });
    }
    if (worker) {
      worker.onerror = function (event) {
        post({ type: 'log', level: 'warn', message: 'worker error: ' + (event.message || 'unknown') });
      };
      worker.onmessage = function (event) {
        var data = event.data;
        if (!data || !data.type) return;
        if (data.type === 'fetch') {
          window.__aidokuFetchPending[data.id] = data.responseSab;
          forwardFetchToNative(data);
          return;
        }
        if (data.type === 'result') {
          post(data);
          return;
        }
        if (data.type === 'error') {
          var errMsg = data.message || 'worker error';
          var errLevel = String(errMsg).indexOf('WASM export not found:') !== -1 ? 'debug' : 'warn';
          post({ type: 'log', level: errLevel, message: 'invoke failed: ' + errMsg });
          post(data);
          return;
        }
        if (data.type === 'log') {
          post(data);
          if (data.message && String(data.message).indexOf('fetch sab pool ready:') === 0) {
            finishBootstrap();
          }
          return;
        }
      };
      post({ type: 'log', level: 'info', message: 'worker started' });
    }
    const host = AidokuWasmHostBundle.createHost({
      postToParent: post,
      onReady: notifyReady,
    });
    var originalRegisterWasm = host.registerWasm.bind(host);
    host.registerWasm = function (sourceId, wasm) {
      originalRegisterWasm(sourceId, wasm);
      if (worker) {
        var copy = wasm.slice();
        worker.postMessage({ type: 'register-wasm', sourceId: sourceId, wasm: copy.buffer }, [copy.buffer]);
      }
    };
    window.__aidokuHost = host;
    function onHostMessage(event) {
      var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (!data || !data.type) return;
      if (data.type === 'fetch-response' || data.type === 'fetch-error') {
        var responseSab = window.__aidokuFetchPending && window.__aidokuFetchPending[data.id];
        if (responseSab && AidokuWasmHostBundle.writeFetchSuccessSab) {
          if (data.type === 'fetch-response') {
            AidokuWasmHostBundle.writeFetchSuccessSab(responseSab, data.status, data.url, data.body);
          } else {
            AidokuWasmHostBundle.writeFetchErrorSab(responseSab, data.message || 'Fetch failed');
          }
          Atomics.notify(new Int32Array(responseSab), 0);
          delete window.__aidokuFetchPending[data.id];
          return;
        }
        host.handleParentMessage(data);
        return;
      }
      if (data.type === 'invoke') {
        post({ type: 'log', level: 'debug', message: 'invoke received: ' + data.method });
        if (worker) {
          worker.postMessage(data);
          return;
        }
        void host.handleInvokeMessage(data).then(function () {
          post({ type: 'log', level: 'debug', message: 'invoke finished: ' + data.method });
        }).catch(function (err) {
          var errMsg = err && err.message ? err.message : String(err);
          var errLevel = String(errMsg).indexOf('WASM export not found:') !== -1 ? 'debug' : 'warn';
          post({ type: 'log', level: errLevel, message: 'invoke failed: ' + errMsg });
        });
        return;
      }
      if (data.type === 'reset-source') {
        if (worker) {
          worker.postMessage(data);
        }
        if (host.resetSource) {
          host.resetSource(data.sourceId);
        }
        return;
      }
      host.handleParentMessage(data);
    }
    window.__aidokuHostDispatch = function (data) {
      onHostMessage({ data: data });
    };
    window.addEventListener('message', onHostMessage);
    document.addEventListener('message', onHostMessage);
    if (!worker) {
      finishBootstrap();
    }
  } catch (error) {
    post({
      type: 'log',
      level: 'warn',
      message: 'bootstrap failed: ' + (error && error.message ? error.message : String(error)),
    });
  }
})();`;

writeFileSync(bundleOut, bootstrap);

console.log('Built assets/aidoku-wasm-host.bundle and assets/aidoku-wasm-host.worker.bundle');
