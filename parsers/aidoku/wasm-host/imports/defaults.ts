import { bool, deserialize, f32, i32, serialize, string } from '@variegated-coffee/serde-postcard-ts';

import type { DefaultValue, FFIResult, WasmEnv } from '../env';
import { asEncoded } from '../env';

// Status codes of the Aidoku `defaults` import namespace (key/value settings storage).
enum DefaultsResult {
  Success = 0,
  InvalidKey = -1,
  InvalidValue = -2,
  FailedEncoding = -3,
  FailedDecoding = -4,
}

// Copies the user's saved source settings into the env before each invoke, so a source reading
// `defaults.get` sees the values chosen in the app's source settings screen.
export function hydrateWasmDefaults(env: WasmEnv, settings: Record<string, unknown>): void {
  for (const [key, raw] of Object.entries(settings)) {
    const value = toDefaultValue(raw);
    if (value) {
      env.defaults.set(key, value);
    }
  }
}

// Maps plain JS values to the typed DefaultValue union (integers vs floats are distinguished
// because the ABI encodes them differently). Unsupported shapes are skipped.
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

// `get` stores the value postcard-encoded behind a Rid; `set` decodes what the module wrote.
// Changes only live in memory for the current session; they are not persisted by the host.
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

// `kind` is the ABI's DefaultValue discriminant: 0 data, 1 bool, 2 int, 3 float, 4 string, 5 string[], 6 null.
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
