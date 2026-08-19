import type { DefaultValue, FFIResult, HttpMethod, NetRequestState, WasmEnv } from '../env';
import { asRequest } from '../env';
import { buildFetchHeaders } from '../../../shared/fetch-headers';
import { createDocument } from '../html-dom';

enum NetResult {
  Success = 0,
  InvalidDescriptor = -1,
  InvalidString = -2,
  InvalidMethod = -3,
  InvalidUrl = -4,
  MissingData = -7,
  MissingResponse = -8,
  RequestError = -10,
  FailedMemoryWrite = -11,
  NotAnImage = -12,
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'HEAD', 'DELETE', 'PATCH', 'OPTIONS', 'CONNECT', 'TRACE'];

export function createNetImports(env: WasmEnv) {
  return {
    init: (method: number): FFIResult => {
      const httpMethod = METHODS[method];
      if (!httpMethod) return NetResult.InvalidMethod;
      const request: NetRequestState = {
        method: httpMethod,
        headers: {},
      };
      return env.store.store({ kind: 'request', value: request });
    },
    send: (rid: number): FFIResult => commonSend(env, rid),
    // Batch path used by sources that fire many parallel requests at once.
    send_all: (ridPtr: number, len: number): FFIResult => {
      try {
        const rids = env.readValues(ridPtr, len);
        if (rids.length === 0) return NetResult.Success;

        const prepared = rids.map((rid) => {
          const request = getRequest(env, rid);
          if (!request) return { rid, error: NetResult.InvalidDescriptor as FFIResult };
          if (!request.url) return { rid, error: NetResult.InvalidUrl as FFIResult };
          return {
            rid,
            fetchRequest: toFetchBridgeRequest(env, rid, request),
          };
        });

        const errors: number[] = new Array(rids.length);
        let wasError = false;

        const batch = prepared.filter(
          (item): item is { rid: number; fetchRequest: ReturnType<typeof toFetchBridgeRequest> } => 'fetchRequest' in item,
        );

        for (const item of prepared) {
          if ('error' in item) {
            const index = rids.indexOf(item.rid);
            errors[index] = item.error;
            wasError = true;
          }
        }

        if (batch.length > 0) {
          const responses =
            batch.length === 1
              ? [env.fetchBridge.send(batch[0]!.fetchRequest)]
              : env.fetchBridge.sendAll(batch.map((item) => item.fetchRequest));

          batch.forEach((item, index) => {
            const response = responses[index];
            if (!response) {
              const slot = rids.indexOf(item.rid);
              errors[slot] = NetResult.RequestError;
              wasError = true;
              return;
            }

            const request = getRequest(env, item.rid);
            if (!request) {
              const slot = rids.indexOf(item.rid);
              errors[slot] = NetResult.InvalidDescriptor;
              wasError = true;
              return;
            }

            request.response = {
              url: response.url,
              status: response.status,
              headers: response.headers ?? {},
              data: new TextEncoder().encode(response.body),
            };
            const slot = rids.indexOf(item.rid);
            errors[slot] = NetResult.Success;
          });
        }

        env.writeValues(ridPtr, errors);
        return wasError ? NetResult.RequestError : NetResult.Success;
      } catch {
        return NetResult.InvalidDescriptor;
      }
    },
    set_url: (rid: number, ptr: number, len: number): FFIResult => {
      try {
        const url = env.readString(ptr, len);
        new URL(url);
        const request = getRequest(env, rid);
        if (!request) return NetResult.InvalidDescriptor;
        request.url = url;
        return NetResult.Success;
      } catch {
        return NetResult.InvalidUrl;
      }
    },
    set_header: (rid: number, keyPtr: number, keyLen: number, valPtr: number, valLen: number): FFIResult => {
      try {
        const key = env.readString(keyPtr, keyLen);
        const value = env.readString(valPtr, valLen);
        const request = getRequest(env, rid);
        if (!request) return NetResult.InvalidDescriptor;
        request.headers[key] = value;
        return NetResult.Success;
      } catch {
        return NetResult.InvalidString;
      }
    },
    set_body: (rid: number, ptr: number, len: number): FFIResult => {
      try {
        const body = env.readBytes(ptr, len);
        const request = getRequest(env, rid);
        if (!request) return NetResult.InvalidDescriptor;
        request.body = body;
        return NetResult.Success;
      } catch {
        return NetResult.InvalidString;
      }
    },
    set_timeout: (rid: number, value: number): FFIResult => {
      const request = getRequest(env, rid);
      if (!request) return NetResult.InvalidDescriptor;
      request.timeout = value;
      return NetResult.Success;
    },
    data_len: (rid: number): FFIResult => {
      const request = getRequest(env, rid);
      if (!request?.response) return NetResult.MissingResponse;
      return request.response.data.length;
    },
    read_data: (rid: number, buffer: number, size: number): FFIResult => {
      const request = getRequest(env, rid);
      if (!request?.response) return NetResult.MissingResponse;
      const data = request.response.data;
      if (size > data.length) return NetResult.FailedMemoryWrite;
      try {
        env.writeBuffer(buffer, data.subarray(0, size));
        return NetResult.Success;
      } catch {
        return NetResult.FailedMemoryWrite;
      }
    },
    get_image: (_rid: number): FFIResult => NetResult.NotAnImage,
    get_status_code: (rid: number): FFIResult => {
      const request = getRequest(env, rid);
      if (!request?.response) return NetResult.MissingResponse;
      return request.response.status;
    },
    get_url: (rid: number): FFIResult => {
      const request = getRequest(env, rid);
      if (!request?.response) return NetResult.MissingResponse;
      return env.store.store({ kind: 'string', value: request.response.url });
    },
    get_header: (rid: number, keyPtr: number, keyLen: number): FFIResult => {
      try {
        const key = env.readString(keyPtr, keyLen).toLowerCase();
        const request = getRequest(env, rid);
        if (!request?.response) return NetResult.MissingResponse;
        const value = Object.entries(request.response.headers).find(([header]) => header.toLowerCase() === key)?.[1];
        if (!value) return NetResult.MissingData;
        return env.store.store({ kind: 'string', value });
      } catch {
        return NetResult.InvalidString;
      }
    },
    html: (rid: number): FFIResult => {
      const request = getRequest(env, rid);
      if (!request?.response) return NetResult.MissingResponse;
      try {
        const text = new TextDecoder().decode(request.response.data);
        const document = createDocument(text, request.response.url);
        return env.store.store({ kind: 'htmlDocument', value: document });
      } catch {
        return NetResult.InvalidString;
      }
    },
    set_rate_limit: (_permits: number, _period: number, _unit: number) => {
      // no-op
    },
  };
}

function getRequest(env: WasmEnv, rid: number): NetRequestState | undefined {
  return asRequest(env.store.getMut(rid));
}

function toFetchBridgeRequest(env: WasmEnv, rid: number, request: NetRequestState) {
  // Merge source defaults (referer, UA) before the request hits RN sync fetch.
  const headers = buildFetchHeaders(request.url!, request.headers, env.sourceBaseUrl);
  return {
    id: `net-${rid}`,
    method: request.method,
    url: request.url!,
    headers,
    body: request.body ? new TextDecoder().decode(request.body) : undefined,
    timeoutMs: request.timeout ? request.timeout * 1000 : 60_000,
    sourceBaseUrl: env.sourceBaseUrl,
    sourceId: env.sourceId,
  };
}

function applyFetchResponse(request: NetRequestState, response: {
  url: string;
  status: number;
  headers?: Record<string, string>;
  body: string;
}): void {
  request.response = {
    url: response.url,
    status: response.status,
    headers: response.headers ?? {},
    data: new TextEncoder().encode(response.body),
  };
}

function commonSend(env: WasmEnv, rid: number): FFIResult {
  const request = getRequest(env, rid);
  if (!request) return NetResult.InvalidDescriptor;
  if (!request.url) return NetResult.InvalidUrl;

  try {
    const response = env.fetchBridge.send(toFetchBridgeRequest(env, rid, request));
    applyFetchResponse(request, response);
    return NetResult.Success;
  } catch {
    return NetResult.RequestError;
  }
}

export function encodeDefaultValue(_kind: number, _bytes: Uint8Array): DefaultValue | null {
  return null;
}

export function storeDefaultEncoded(_env: WasmEnv, _value: unknown, _schema: unknown): FFIResult {
  return -3;
}
