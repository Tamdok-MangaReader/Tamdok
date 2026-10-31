// Android copy of the Aidoku WASM host: no localhost server (see prepareHostSource).
import { Asset } from 'expo-asset';
import {
  copyAsync,
  documentDirectory,
  makeDirectoryAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import RNWebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import {
  handleHostMessage,
  requestAidokuHostRestart,
  setAidokuHostRestarter,
  setAidokuHostInjector,
  setAidokuHostPoster,
  type HostInboundMessage,
  type HostOutboundMessage,
} from '@/parsers/aidoku/wasm-bridge';
import { NHENTAI_FETCH_USER_AGENT } from '@/parsers/shared/fetch-headers';
import { logAidokuWasm } from '@/parsers/aidoku/wasm-log';

// Relative path so Metro always resolves the bundled asset (the @/assets alias is TS-only).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wasmHostBundle = require('../../../assets/aidoku-wasm-host.bundle');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wasmHostWorker = require('../../../assets/aidoku-wasm-host.worker.bundle');

type WebViewRef = {
  postMessage: (message: string) => void;
  injectJavaScript: (script: string) => void;
};

type WebViewSource =
  | { uri: string }
  | {
      html: string;
      baseUrl: string;
    };

type PreparedHost = {
  source: WebViewSource;
  readAccessUri: string;
  label: string;
  stop?: () => Promise<void>;
};

const HOST_DIR = `${documentDirectory ?? ''}aidoku-wasm-host/`;
const HOST_HTML = `${HOST_DIR}index.html`;
const HOST_SCRIPT = `${HOST_DIR}host.bundle.js`;
const HOST_WORKER = `${HOST_DIR}host.worker.js`;

const INDEX_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
  </head>
  <body>
    <script>window.__AIDOKU_WORKER_URL = './host.worker.js';</script>
    <script src="./host.bundle.js"></script>
  </body>
</html>`;

const HOST_READY_POLL =
  "(function(){if(window.__aidokuHost&&window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'host-ready'}));return;}setTimeout(function(){if(window.__aidokuHost&&window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'host-ready'}));}},50);})();true;";

const BLANK_SOURCE: WebViewSource = {
  html: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>',
  baseUrl: 'about:blank',
};

function toNativePath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

function buildInlineHostHtml(script: string, workerScript: string): string {
  const workerLiteral = JSON.stringify(workerScript);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
  </head>
  <body>
    <script>
      window.__AIDOKU_WORKER_URL = URL.createObjectURL(new Blob([${workerLiteral}], { type: 'application/javascript' }));
    </script>
    <script>${script}</script>
  </body>
</html>`;
}

async function prepareHostSource(): Promise<PreparedHost> {
  // iOS/Android serve the host over localhost so COEP headers apply; web inlines blobs.
  const asset = Asset.fromModule(wasmHostBundle);
  const workerAsset = Asset.fromModule(wasmHostWorker);
  await asset.downloadAsync();
  await workerAsset.downloadAsync();

  const bundleUri = asset.localUri ?? asset.uri;
  const workerUri = workerAsset.localUri ?? workerAsset.uri;
  if (!bundleUri || !workerUri) {
    throw new Error('Aidoku WASM host bundle URI is missing');
  }

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    const [bundleScript, workerScript] = await Promise.all([
      fetch(bundleUri).then((response) => response.text()),
      fetch(workerUri).then((response) => response.text()),
    ]);
    const baseUrl = bundleUri.slice(0, bundleUri.lastIndexOf('/') + 1);
    return {
      source: {
        html: buildInlineHostHtml(bundleScript, workerScript),
        baseUrl,
      },
      readAccessUri: baseUrl,
      label: baseUrl,
    };
  }

  if (!documentDirectory) {
    throw new Error('documentDirectory is unavailable');
  }

  await makeDirectoryAsync(HOST_DIR, { intermediates: true });
  await copyAsync({ from: bundleUri, to: HOST_SCRIPT });
  await copyAsync({ from: workerUri, to: HOST_WORKER });
  await writeAsStringAsync(HOST_HTML, INDEX_HTML);

  // Android: load the host straight from file:// instead of the localhost server. The page then has a
  // file origin and, with allowUniversalAccessFromFileURLs, its synchronous XHR (the fetch fallback used
  // when cross-origin isolation is unavailable) is not blocked by CORS. A http://localhost origin would
  // make every cross-site request fail with "Network request failed".
  return {
    source: { uri: `file://${toNativePath(HOST_HTML)}` },
    readAccessUri: toNativePath(HOST_DIR),
    label: HOST_HTML,
  };
}

export function AidokuWasmHost() {
  const webViewRef = useRef<WebViewRef | null>(null);
  const stopServerRef = useRef<(() => Promise<void>) | null>(null);
  const [source, setSource] = useState<WebViewSource>(BLANK_SOURCE);
  const [readAccessUri, setReadAccessUri] = useState<string | undefined>(undefined);
  const [hostKey, setHostKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const prepared = await prepareHostSource();
        if (cancelled) {
          await prepared.stop?.();
          return;
        }

        stopServerRef.current = prepared.stop ?? null;
        logAidokuWasm('info', `Host server ready ${prepared.label}`);
        setReadAccessUri(prepared.readAccessUri);
        setSource(prepared.source);
        setHostKey((value) => value + 1);
      } catch (error) {
        logAidokuWasm('warn', `Failed to prepare host files ${error instanceof Error ? error.message : String(error)}`);
      }
    })();

    return () => {
      cancelled = true;
      const stop = stopServerRef.current;
      stopServerRef.current = null;
      if (stop) {
        void stop();
      }
    };
  }, []);

  useEffect(() => {
    setAidokuHostPoster((message: HostOutboundMessage) => {
      webViewRef.current?.postMessage(JSON.stringify(message));
    });
    setAidokuHostInjector((script: string) => {
      webViewRef.current?.injectJavaScript(script);
    });
    return () => {
      setAidokuHostPoster(null);
      setAidokuHostInjector(null);
    };
  }, []);

  useEffect(() => {
    setAidokuHostRestarter(() => {
      setHostKey((value) => value + 1);
    });
    return () => setAidokuHostRestarter(null);
  }, []);

  const pollHostReady = () => {
    webViewRef.current?.injectJavaScript(HOST_READY_POLL);
  };

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as HostInboundMessage;
      handleHostMessage(message);
    } catch (error) {
      logAidokuWasm('warn', `Failed to parse host message ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <View pointerEvents='none' style={styles.host}>
      <RNWebView
        key={hostKey}
        ref={(ref) => {
          webViewRef.current = ref as WebViewRef | null;
        }}
        originWhitelist={['*']}
        source={source}
        allowingReadAccessToURL={readAccessUri ? `file://${readAccessUri}` : undefined}
        onMessage={onMessage}
        onContentProcessDidTerminate={() => requestAidokuHostRestart('content process terminated')}
        onRenderProcessGone={() => requestAidokuHostRestart('render process gone')}
        onLoadEnd={pollHostReady}
        onLoadStart={() => {
          logAidokuWasm('debug', 'WebView load started');
        }}
        onError={(event) => {
          logAidokuWasm('warn', `WebView load error ${JSON.stringify(event.nativeEvent)}`);
        }}
        onHttpError={(event) => {
          logAidokuWasm('warn', `WebView HTTP error ${JSON.stringify(event.nativeEvent)}`);
        }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode='always'
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        userAgent={NHENTAI_FETCH_USER_AGENT}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: -500,
    width: 320,
    height: 480,
    opacity: 0.01,
  },
  webview: {
    flex: 1,
  },
});
