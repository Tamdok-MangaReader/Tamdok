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

export type SharedFetchInit = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: RequestInit['body'];
  sourceBaseUrl?: string;
  signal?: AbortSignal | null;
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

const REQUEST_TIMEOUT_MS = 45_000;

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

function cacheKeyFor(url: string, headers: Record<string, string>): string {
  const sorted = Object.keys(headers)
    .sort()
    .map((key) => `${key.toLowerCase()}:${headers[key]}`)
    .join('\n');
  return `${url}\n${sorted}`;
}

function wantsFresh(headers: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    if ((name === 'cache-control' || name === 'pragma') && /no-cache|no-store|max-age=0/i.test(value)) {
      return true;
    }
  }
  return false;
}

async function executeFetch(
  init: SharedFetchInit,
  method: string,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<SharedFetchResult> {
  const maxAttempts = Math.max(1, init.maxAttempts ?? (method === 'GET' ? 3 : 1));
  await acquireHostSlot(init.url, signal);

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
      reportHostResponse(init.url, response.status, responseHeaders['retry-after']);

      if (isRetryableStatus(response.status, method) && attempt < maxAttempts - 1) {
        init.onLog?.('debug', `HTTP ${response.status} ${method} ${init.url}, retry ${attempt + 1}/${maxAttempts - 1}`);
        pendingDelay = retryDelayMs(response.status, attempt + 1, responseHeaders['retry-after']);
        continue;
      }

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
