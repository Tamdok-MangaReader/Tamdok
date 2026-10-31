import type {
  TamdokRequest,
  TamdokResponse,
  TamdokSourceContext,
  TamdokSourceModule,
} from "../../shared/types";
import * as SecureStore from "expo-secure-store";
import { sharedFetch } from "../../shared/http";
import { parse } from "node-html-parser";
import {
  reportSourceHealthy,
  reportSourceTrouble,
} from "@/utils/source-connection-status";

// Request cancellation bookkeeping, keyed by source id.
// - sourceControllers: AbortControllers of requests currently in flight.
// - sourceWatchers: how many screens currently care about the source's requests (ref count).
// - sourceBlockedUntil: after a cancel, new requests are rejected for a short window so a
//   screen that was just left cannot immediately start fresh work for the source.
const sourceControllers = new Map<string, Set<AbortController>>();
const sourceWatchers = new Map<string, number>();
const sourceBlockedUntil = new Map<string, number>();
const controllerCreatedAt = new WeakMap<AbortController, number>();
// How long requests stay blocked after cancelTamdokSourceRequests.
const CANCEL_BLOCK_MS = 4000;

function cancelledError(): Error {
  const error = new Error("Request aborted");
  error.name = "AbortError";
  return error;
}

// A screen calls retain when it starts using a source and release when it leaves.
// When the last watcher releases, every in-flight request of that source is aborted.
export function retainTamdokSourceRequests(sourceId: string): void {
  sourceBlockedUntil.delete(sourceId);
  sourceWatchers.set(sourceId, (sourceWatchers.get(sourceId) ?? 0) + 1);
}

export function releaseTamdokSourceRequests(sourceId: string): void {
  const next = (sourceWatchers.get(sourceId) ?? 0) - 1;
  if (next > 0) {
    sourceWatchers.set(sourceId, next);
    return;
  }
  sourceWatchers.delete(sourceId);
  cancelTamdokSourceRequests(sourceId);
}

export function cancelTamdokSourceRequests(sourceId: string): void {
  sourceBlockedUntil.set(sourceId, Date.now() + CANCEL_BLOCK_MS);
  const controllers = sourceControllers.get(sourceId);
  if (!controllers) return;
  sourceControllers.delete(sourceId);
  for (const controller of controllers) controller.abort();
}

// Aborts only requests started at or before `cutoff` (used to drop stale requests on refresh
// while keeping the newer ones alive).
export function cancelTamdokSourceRequestsBefore(
  sourceId: string,
  cutoff: number,
): void {
  const controllers = sourceControllers.get(sourceId);
  if (!controllers) return;
  for (const controller of [...controllers]) {
    if ((controllerCreatedAt.get(controller) ?? 0) <= cutoff) {
      controllers.delete(controller);
      controller.abort();
    }
  }
}

// Wraps a request with source-level cancellation: the request gets its own controller,
// registered under the source id, and is also linked to the caller's own AbortSignal.
async function performRequest(
  url: string,
  init: RequestInit | undefined,
  sourceBaseUrl?: string,
  sourceId?: string,
): Promise<TamdokResponse> {
  if (
    sourceId &&
    !sourceWatchers.get(sourceId) &&
    Date.now() < (sourceBlockedUntil.get(sourceId) ?? 0)
  ) {
    throw cancelledError();
  }
  const controller = new AbortController();
  controllerCreatedAt.set(controller, Date.now());
  const outer = init?.signal;
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", onOuterAbort, { once: true });
  }
  let tracked: Set<AbortController> | undefined;
  if (sourceId) {
    tracked = sourceControllers.get(sourceId);
    if (!tracked) {
      tracked = new Set();
      sourceControllers.set(sourceId, tracked);
    }
    tracked.add(controller);
  }
  try {
    return await performRequestInner(
      url,
      init,
      sourceBaseUrl,
      controller.signal,
      sourceId,
    );
  } finally {
    tracked?.delete(controller);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}

// Translates a fetch-style call into sharedFetch and feeds the outcome into the
// connection-status indicator (retries, 429 and 5xx count as trouble; < 400 as healthy).
async function performRequestInner(
  url: string,
  init: RequestInit | undefined,
  sourceBaseUrl: string | undefined,
  signal: AbortSignal,
  sourceId?: string,
): Promise<TamdokResponse> {
  const initHeaders = headersFromInit(init?.headers);
  const method = init?.method ?? "GET";
  // Everything in RequestInit that sharedFetch does not handle itself is passed through unchanged.
  const passthrough: Record<string, unknown> = { ...init };
  delete passthrough.headers;
  delete passthrough.method;
  delete passthrough.body;
  delete passthrough.signal;
  let result: Awaited<ReturnType<typeof sharedFetch>>;
  try {
    result = await sharedFetch({
      url,
      method,
      headers: initHeaders,
      body: init?.body,
      signal,
      sourceBaseUrl,
      passthrough: passthrough as RequestInit,
      onLog: (_level, message) => {
        if (sourceId && /retry/i.test(message)) reportSourceTrouble(sourceId);
      },
    });
  } catch (error) {
    if (sourceId && (error as Error)?.name !== "AbortError") {
      reportSourceTrouble(sourceId);
    }
    throw error;
  }
  if (sourceId) {
    if (result.status === 429 || result.status >= 500) {
      reportSourceTrouble(sourceId);
    } else if (result.status < 400) {
      reportSourceHealthy(sourceId);
    }
  }
  return createResponse(result);
}

// The `request` helper handed to sources. Sources get a tiny fetch-like API,
// never the raw global fetch.
export function createRequest(
  sourceBaseUrl?: string,
  sourceId?: string,
): TamdokRequest {
  return {
    get: (url, init) =>
      performRequest(url, { ...init, method: "GET" }, sourceBaseUrl, sourceId),
    post: (url, init) =>
      performRequest(url, { ...init, method: "POST" }, sourceBaseUrl, sourceId),
    fetch: (url, init) => performRequest(url, init, sourceBaseUrl, sourceId),
  };
}

function headersFromInit(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}

// Response objects are fully buffered: `text()`, `json()` and `html()` can be called repeatedly.
function createResponse(result: {
  status: number;
  url: string;
  body: string;
}): TamdokResponse {
  const textBody = result.body;
  return {
    status: result.status,
    url: result.url,
    text: async () => textBody,
    json: async <T>() => JSON.parse(textBody) as T,
    html: () => parse(textBody),
  };
}

// Source settings are mirrored in memory so `defaults.get` can stay synchronous inside sources.
// Keys are namespaced as `<sourceId>:<key>`.
const defaultsStore = new Map<string, unknown>();

export function hydrateTamdokDefaults(
  sourceId: string,
  settings: Record<string, unknown>,
): void {
  const prefix = `${sourceId}:`;
  for (const [key, value] of Object.entries(settings)) {
    defaultsStore.set(prefix + key, value);
  }
}

export function clearTamdokDefaults(sourceId: string): void {
  const prefix = `${sourceId}:`;
  for (const key of [...defaultsStore.keys()]) {
    if (key.startsWith(prefix)) defaultsStore.delete(key);
  }
}

export function createDefaults(
  sourceId: string,
): TamdokSourceContext["defaults"] {
  const prefix = `${sourceId}:`;
  return {
    get: <T>(key: string, fallback?: T) => {
      const value = defaultsStore.get(prefix + key);
      return (value as T | undefined) ?? fallback;
    },
    set: async <T>(key: string, value: T) => {
      defaultsStore.set(prefix + key, value);
    },
  };
}

// Cookies captured by the in-app web login for this source (see the source's login setting).
export async function getCookies(sourceId: string): Promise<JSON | null> {
  const stored = await SecureStore.getItemAsync(`source_cookies_${sourceId}`);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// The context object passed to every source function.
export function createSourceContext(
  sourceId: string,
  sourceBaseUrl?: string,
): TamdokSourceContext {
  return {
    sourceId,
    request: createRequest(sourceBaseUrl, sourceId),
    cookies: getCookies(sourceId),
    defaults: createDefaults(sourceId),
  };
}

export type LoadedTamdokSource = {
  module: TamdokSourceModule;
  context: TamdokSourceContext;
};

export function createTamdokRunner(
  sourceId: string,
  module: TamdokSourceModule,
  sourceBaseUrl?: string,
): LoadedTamdokSource {
  return {
    module,
    context: createSourceContext(sourceId, sourceBaseUrl),
  };
}
