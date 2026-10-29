import type {
  TamdokRequest,
  TamdokResponse,
  TamdokSourceContext,
  TamdokSourceModule,
} from "../../shared/types";
import * as SecureStore from "expo-secure-store";
import { sharedFetch } from "../../shared/http";
import { parse } from "node-html-parser";

async function performRequest(
  url: string,
  init: RequestInit | undefined,
  sourceBaseUrl?: string,
): Promise<TamdokResponse> {
  const initHeaders = headersFromInit(init?.headers);
  const method = init?.method ?? "GET";
  const passthrough: Record<string, unknown> = { ...init };
  delete passthrough.headers;
  delete passthrough.method;
  delete passthrough.body;
  delete passthrough.signal;
  const result = await sharedFetch({
    url,
    method,
    headers: initHeaders,
    body: init?.body,
    signal: init?.signal,
    sourceBaseUrl,
    passthrough: passthrough as RequestInit,
  });
  return createResponse(result);
}

export function createRequest(sourceBaseUrl?: string): TamdokRequest {
  return {
    get: (url, init) =>
      performRequest(url, { ...init, method: "GET" }, sourceBaseUrl),
    post: (url, init) =>
      performRequest(url, { ...init, method: "POST" }, sourceBaseUrl),
    fetch: (url, init) => performRequest(url, init, sourceBaseUrl),
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

export async function getCookies(sourceId: string): Promise<JSON | null> {
  const stored = await SecureStore.getItemAsync(`source_cookies_${sourceId}`);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function createSourceContext(
  sourceId: string,
  sourceBaseUrl?: string,
): TamdokSourceContext {
  return {
    sourceId,
    request: createRequest(sourceBaseUrl),
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
