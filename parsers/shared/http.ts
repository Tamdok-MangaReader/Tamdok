import { buildFetchHeaders } from './fetch-headers';
import { retryDelayMs } from './fetch-rate-limit';
import { ensureClearanceLoaded, hostFromUrl, withClearance } from './host-clearance';
import {
  acquireHostSlot,
  invalidateResponseCacheForHost,
  looksLikeCloudflareChallenge,
  markHostChallenged,
  pause,
  readResponseCache,
  reportHostResponse,
  writeResponseCache,
} from './net-policy';

// Shared HTTP layer used by every source runtime (Aidoku WASM and Tamdok packages).
// It adds per-host throttling, retries, Cloudflare clearance cookies, a short-lived
// response cache and de-duplication of identical in-flight GET requests.
export type SharedFetchInit = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: RequestInit['body'];
  // Base URL of the source; used to derive Referer/Origin style headers.
  sourceBaseUrl?: string;
  signal?: AbortSignal | null;
  // Total attempts including the first one. Defaults to 3 for GET and 1 for other methods.
  maxAttempts?: number;
  passthrough?: Omit<RequestInit, 'method' | 'headers' | 'body' | 'signal'>;
  onLog?: (level: 'debug' | 'warn', message: string) => void;
};

export type SharedFetchResult = {
  status: number;
  url: string;
  body: string;
  headers: Record<string, string>;
};

// Hard per-attempt timeout; the attempt is aborted and treated as a network error.
const REQUEST_TIMEOUT_MS = 45_000;

// An in-flight GET request that several callers may be waiting on.
// `waiters` is reference-counted so the real request is only aborted once every caller gave up.
type SharedEntry = {
  promise: Promise<SharedFetchResult>;
  waiters: number;
  controller: AbortController;
};

const inflight = new Map<string, SharedEntry>();

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

// Only rate limiting (429) is retried for every method. Gateway errors are retried
// for GET only, because repeating a POST could duplicate a side effect.
function isRetryableStatus(status: number, method: string): boolean {
  if (status === 429) return true;
  return method === 'GET' && (status === 502 || status === 503 || status === 504);
}

function collectHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

// The cache key includes the (sorted) request headers because cookies and tokens
// can change the response body for the same URL.
function cacheKeyFor(url: string, headers: Record<string, string>): string {
  const sorted = Object.keys(headers)
    .sort()
    .map((key) => `${key.toLowerCase()}:${headers[key]}`)
    .join('\n');
  return `${url}\n${sorted}`;
}

// Callers can bypass the cache and request de-duplication by sending
// Cache-Control/Pragma: no-cache, no-store or max-age=0.
function wantsFresh(headers: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    if ((name === 'cache-control' || name === 'pragma') && /no-cache|no-store|max-age=0/i.test(value)) {
      return true;
    }
  }
  return false;
}

// Performs the actual request: waits for a host slot, then loops over attempts.
// Each attempt has its own AbortController so the timeout and the caller's signal
// both cancel only that attempt.
async function executeFetch(
  init: SharedFetchInit,
  method: string,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<SharedFetchResult> {
  const maxAttempts = Math.max(1, init.maxAttempts ?? (method === 'GET' ? 3 : 1));
  await acquireHostSlot(init.url, signal);

  // Delay to apply before the next attempt (backoff or Retry-After).
  let pendingDelay = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw abortError();
    if (pendingDelay > 0) {
      await pause(pendingDelay, signal);
      pendingDelay = 0;
      if (signal?.aborted) throw abortError();
    }

    const attemptController = new AbortController();
    const onOuterAbort = () => attemptController.abort();
    signal?.addEventListener('abort', onOuterAbort, { once: true });
    const timer = setTimeout(() => attemptController.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(init.url, {
        ...init.passthrough,
        method,
        headers,
        body: init.body,
        signal: attemptController.signal,
      });
      const body = await response.text();
      const responseHeaders = collectHeaders(response);
      // Feed the status back into the per-host throttle so 429/503 slow down later requests.
      reportHostResponse(init.url, response.status, responseHeaders['retry-after']);

      if (isRetryableStatus(response.status, method) && attempt < maxAttempts - 1) {
        init.onLog?.('debug', `HTTP ${response.status} ${method} ${init.url}, retry ${attempt + 1}/${maxAttempts - 1}`);
        pendingDelay = retryDelayMs(response.status, attempt + 1, responseHeaders['retry-after']);
        continue;
      }

      // Remember that this host is behind a Cloudflare challenge so the UI can offer to solve it.
      if (looksLikeCloudflareChallenge(response.status, responseHeaders, body)) {
        markHostChallenged(hostFromUrl(init.url));
      }

      return { status: response.status, url: response.url, body, headers: responseHeaders };
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (attempt >= maxAttempts - 1) throw error;
      pendingDelay = retryDelayMs(0, attempt + 1);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
    }
  }
  throw new Error('Fetch failed');
}

// Attaches one caller to a shared in-flight request. When the last waiter aborts,
// the underlying request is cancelled and removed from the in-flight map.
function awaitShared(entry: SharedEntry, key: string, signal?: AbortSignal | null): Promise<SharedFetchResult> {
  if (signal?.aborted) return Promise.reject(abortError());
  entry.waiters += 1;
  return new Promise<SharedFetchResult>((resolve, reject) => {
    let done = false;
    const onAbort = () => {
      if (done) return;
      done = true;
      entry.waiters -= 1;
      if (entry.waiters <= 0) {
        if (inflight.get(key) === entry) inflight.delete(key);
        entry.controller.abort();
      }
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    entry.promise.then(
      (value) => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

// Entry point. Non-GET requests are never cached or shared and invalidate the host cache.
// GET requests go through: cache lookup -> join in-flight request -> new request.
export async function sharedFetch(init: SharedFetchInit): Promise<SharedFetchResult> {
  await ensureClearanceLoaded();
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = withClearance(init.url, buildFetchHeaders(init.url, init.headers ?? {}, init.sourceBaseUrl));
  const signal = init.signal ?? undefined;

  if (signal?.aborted) throw abortError();

  if (method !== 'GET') {
    const result = await executeFetch(init, method, headers, signal);
    invalidateResponseCacheForHost(init.url);
    return result;
  }

  // `fresh` requests skip both reading and writing the cache and are never shared.
  const fresh = wantsFresh(headers);
  const key = cacheKeyFor(init.url, headers);

  if (!fresh) {
    const hit = readResponseCache(key);
    if (hit) {
      init.onLog?.('debug', `fetch cache hit ${init.url}`);
      return hit;
    }
  }

  const existing = inflight.get(key);
  if (existing && !fresh) return awaitShared(existing, key, signal);

  const controller = new AbortController();
  const entry: SharedEntry = {
    waiters: 0,
    controller,
    promise: executeFetch(init, method, headers, controller.signal).then((result) => {
      if (!fresh) writeResponseCache(key, init.url, result);
      return result;
    }),
  };
  entry.promise
    .finally(() => {
      if (inflight.get(key) === entry) inflight.delete(key);
    })
    .catch(() => undefined);
  if (!fresh) inflight.set(key, entry);
  return awaitShared(entry, key, signal);
}
