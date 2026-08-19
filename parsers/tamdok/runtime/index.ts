import type { TamdokRequest, TamdokResponse, TamdokSourceContext, TamdokSourceModule } from '../../shared/types';
import { buildFetchHeaders } from '../../shared/fetch-headers';
import { parse } from 'node-html-parser';

async function performRequest(url: string, init: RequestInit | undefined, sourceBaseUrl?: string): Promise<TamdokResponse> {
  const initHeaders = headersFromInit(init?.headers);
  const method = init?.method ?? 'GET';
  const response = await fetch(url, {
    ...init,
    method,
    headers: buildFetchHeaders(url, initHeaders, sourceBaseUrl),
  });
  return createResponse(response);
}

export function createRequest(sourceBaseUrl?: string): TamdokRequest {
  return {
    get: (url, init) => performRequest(url, { ...init, method: 'GET' }, sourceBaseUrl),
    post: (url, init) => performRequest(url, { ...init, method: 'POST' }, sourceBaseUrl),
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

async function createResponse(response: Response): Promise<TamdokResponse> {
  const textBody = await response.text();
  return {
    status: response.status,
    url: response.url,
    text: async () => textBody,
    json: async <T>() => JSON.parse(textBody) as T,
    html: () => parse(textBody),
  };
}

const defaultsStore = new Map<string, unknown>();

export function hydrateTamdokDefaults(sourceId: string, settings: Record<string, unknown>): void {
  const prefix = `${sourceId}:`;
  for (const [key, value] of Object.entries(settings)) {
    defaultsStore.set(prefix + key, value);
  }
}

export function createDefaults(sourceId: string): TamdokSourceContext['defaults'] {
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

export function createSourceContext(sourceId: string, sourceBaseUrl?: string): TamdokSourceContext {
  return {
    sourceId,
    request: createRequest(sourceBaseUrl),
    defaults: createDefaults(sourceId),
  };
}

export type LoadedTamdokSource = {
  module: TamdokSourceModule;
  context: TamdokSourceContext;
};

export function createTamdokRunner(sourceId: string, module: TamdokSourceModule, sourceBaseUrl?: string): LoadedTamdokSource {
  return {
    module,
    context: createSourceContext(sourceId, sourceBaseUrl),
  };
}
