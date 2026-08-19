import { bool, deserialize, f32, i32, serialize, string } from '@variegated-coffee/serde-postcard-ts';

import type { DefaultValue, FFIResult, WasmEnv } from '../env';
import { asEncoded } from '../env';

enum DefaultsResult {
  Success = 0,
  InvalidKey = -1,
  InvalidValue = -2,
  FailedEncoding = -3,
  FailedDecoding = -4,
}

export function hydrateWasmDefaults(env: WasmEnv, settings: Record<string, unknown>): void {
  for (const [key, raw] of Object.entries(settings)) {
    const value = toDefaultValue(raw);
    if (value) {
      env.defaults.set(key, value);
    }
  }
}

function toDefaultValue(raw: unknown): DefaultValue | null {
  if (raw == null) return { kind: 'null' };
  if (typeof raw === 'boolean') return { kind: 'bool', value: raw };
  if (typeof raw === 'number') {
    if (Number.isInteger(raw)) return { kind: 'int', value: raw };
    return { kind: 'float', value: raw };
  }
  if (typeof raw === 'string') return { kind: 'string', value: raw };
  if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) {
    return { kind: 'stringArray', value: raw };
  }
  if (raw instanceof Uint8Array) return { kind: 'data', value: raw };
  return null;
}

export function createDefaultsImports(env: WasmEnv) {
  return {
    get: (keyPtr: number, len: number): FFIResult => {
      try {
        const key = env.readString(keyPtr, len);
        const value = env.defaults.get(key);
        if (!value) return DefaultsResult.InvalidValue;
        return storeDefault(env, value);
      } catch {
        return DefaultsResult.InvalidKey;
      }
    },
    set: (keyPtr: number, len: number, kind: number, valuePtr: number): FFIResult => {
      try {
        const key = env.readString(keyPtr, len);
        if (kind > 6) return DefaultsResult.InvalidValue;
        const bytes = env.readItemBytes(valuePtr);
        const value = decodeDefault(kind, bytes);
        if (!value) return DefaultsResult.FailedDecoding;
        env.defaults.set(key, value);
        return DefaultsResult.Success;
      } catch {
        return DefaultsResult.InvalidKey;
      }
    },
  };
}

function storeDefault(env: WasmEnv, value: DefaultValue): FFIResult {
  switch (value.kind) {
    case 'data':
      return env.store.storeEncoded(value.value);
    case 'bool':
      return env.store.storeEncoded(serialize(bool(), value.value));
    case 'int':
      return env.store.storeEncoded(serialize(i32(), value.value));
    case 'float':
      return env.store.storeEncoded(serialize(f32(), value.value));
    case 'string':
      return env.store.storeEncoded(serialize(string(), value.value));
    case 'stringArray':
      return env.store.storeEncoded(serialize({ kind: 'seq', item: string() } as never, value.value));
    default:
      return DefaultsResult.InvalidValue;
  }
}

function decodeDefault(kind: number, bytes: Uint8Array): DefaultValue | null {
  try {
    switch (kind) {
      case 0:
        return { kind: 'data', value: bytes };
      case 1:
        return { kind: 'bool', value: deserialize(bool(), bytes).value };
      case 2:
        return { kind: 'int', value: deserialize(i32(), bytes).value };
      case 3:
        return { kind: 'float', value: deserialize(f32(), bytes).value };
      case 4:
        return { kind: 'string', value: deserialize(string(), bytes).value };
      case 5:
        return { kind: 'stringArray', value: deserialize({ kind: 'seq', item: string() } as never, bytes).value as string[] };
      case 6:
        return { kind: 'null' };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function readDefaultBytes(env: WasmEnv, rid: number): Uint8Array | null {
  return asEncoded(env.store.get(rid)) ?? null;
}
