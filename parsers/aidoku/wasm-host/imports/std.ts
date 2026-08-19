import { deserialize, serialize } from '@variegated-coffee/serde-postcard-ts';

import type { FFIResult, Rid, WasmEnv } from '../env';
import { asEncoded } from '../env';

enum StdResult {
  Success = 0,
  InvalidDescriptor = -1,
  FailedMemoryWrite = -3,
  InvalidString = -4,
  InvalidDateString = -5,
}

// Postcard encode/decode and stdout hooks shared by every Aidoku WASM module.
export function createStdImports(env: WasmEnv) {
  return {
    print: (ptr: number, len: number) => {
      try {
        const text = env.readString(ptr, len);
        env.writeStdout(text.endsWith('\n') ? text : `${text}\n`);
      } catch {
        env.writeStdout('error: failed to read string for printing.\n');
      }
    },
    abort: () => {
      env.writeStdout('error: abort called.\n');
    },
    destroy: (rid: Rid) => {
      env.store.remove(rid);
    },
    buffer_len: (rid: Rid): FFIResult => {
      const data = asEncoded(env.store.get(rid));
      if (!data) return StdResult.InvalidDescriptor;
      return data.length;
    },
    read_buffer: (rid: Rid, ptr: number, size: number): FFIResult => {
      const data = asEncoded(env.store.get(rid));
      if (!data) return StdResult.InvalidDescriptor;
      if (size > data.length) return StdResult.FailedMemoryWrite;
      try {
        env.writeBuffer(ptr, data.subarray(0, size));
        return StdResult.Success;
      } catch {
        return StdResult.FailedMemoryWrite;
      }
    },
    current_date: (): number => Date.now() / 1000,
    utc_offset: (): number => new Date().getTimezoneOffset() * 60,
    parse_date: (
      datePtr: number,
      dateLen: number,
      formatPtr: number,
      formatLen: number,
      _localePtr: number,
      _localeLen: number,
      timezonePtr: number,
      timezoneLen: number,
    ): number => {
      try {
        const dateStr = env.readString(datePtr, dateLen);
        const format = env.readString(formatPtr, formatLen);
        const timezone = timezoneLen > 0 ? env.readString(timezonePtr, timezoneLen) : 'UTC';
        const chronoFormat = swiftDateFormatToChrono(format);
        const timestamp = parseWithFormat(dateStr, chronoFormat, timezone);
        if (timestamp == null) return StdResult.InvalidDateString;
        return timestamp;
      } catch {
        return StdResult.InvalidString;
      }
    },
  };
}

function swiftDateFormatToChrono(format: string): string {
  let result = '';
  let i = 0;
  while (i < format.length) {
    const c = format[i]!;
    i += 1;
    switch (c) {
      case 'y': {
        let count = 1;
        while (i < format.length && format[i] === 'y') {
          i += 1;
          count += 1;
        }
        result += count === 2 ? '%y' : '%Y';
        break;
      }
      case 'M': {
        let count = 1;
        while (i < format.length && format[i] === 'M') {
          i += 1;
          count += 1;
        }
        if (count <= 2) result += '%m';
        else if (count === 3) result += '%b';
        else result += '%B';
        break;
      }
      case 'd': {
        while (i < format.length && format[i] === 'd') i += 1;
        result += '%d';
        break;
      }
      case 'H': {
        while (i < format.length && format[i] === 'H') i += 1;
        result += '%H';
        break;
      }
      case 'h': {
        while (i < format.length && format[i] === 'h') i += 1;
        result += '%I';
        break;
      }
      case 'm': {
        while (i < format.length && format[i] === 'm') i += 1;
        result += '%M';
        break;
      }
      case 's': {
        while (i < format.length && format[i] === 's') i += 1;
        result += '%S';
        break;
      }
      case 'a':
        result += '%p';
        break;
      case 'E': {
        let count = 1;
        while (i < format.length && format[i] === 'E') {
          i += 1;
          count += 1;
        }
        result += count >= 4 ? '%A' : '%a';
        break;
      }
      case 'z':
      case 'Z': {
        while (i < format.length && format[i] === c) i += 1;
        result += '%Z';
        break;
      }
      default:
        result += c;
    }
  }
  return result;
}

function parseWithFormat(dateStr: string, format: string, timezone: string): number | null {
  const parts = tokenize(dateStr, format);
  if (!parts) return null;
  const year = parts.year ?? new Date().getFullYear();
  const month = (parts.month ?? 1) - 1;
  const day = parts.day ?? 1;
  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  const second = parts.second ?? 0;
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (timezone === 'current') {
    return Math.floor(date.getTime() / 1000) - new Date().getTimezoneOffset() * 60;
  }
  return Math.floor(date.getTime() / 1000);
}

function tokenize(dateStr: string, format: string): Record<string, number> | null {
  const values: Record<string, number> = {};
  let i = 0;
  let j = 0;
  while (j < format.length) {
    const token = format.slice(j, j + 2);
    if (token.startsWith('%')) {
      j += 2;
      const tokenKey = token[1]!;
      if (tokenKey === 'n' || tokenKey === 't') continue;
      const chunk = readChunk(dateStr, i, tokenKey);
      if (chunk == null) return null;
      i += chunk.raw.length;
      if (tokenKey === 'Y' || tokenKey === 'y') values.year = chunk.value;
      if (tokenKey === 'm') values.month = chunk.value;
      if (tokenKey === 'd') values.day = chunk.value;
      if (tokenKey === 'H' || tokenKey === 'I') values.hour = chunk.value;
      if (tokenKey === 'M') values.minute = chunk.value;
      if (tokenKey === 'S') values.second = chunk.value;
      continue;
    }
    if (dateStr[i] !== format[j]) return null;
    i += 1;
    j += 1;
  }
  return values;
}

function readChunk(input: string, start: number, token: string): { raw: string; value: number } | null {
  if (token === 'Y') {
    const raw = input.slice(start, start + 4);
    return /^\d{4}$/.test(raw) ? { raw, value: Number(raw) } : null;
  }
  if (token === 'y') {
    const raw = input.slice(start, start + 2);
    return /^\d{2}$/.test(raw) ? { raw, value: 2000 + Number(raw) } : null;
  }
  if (token === 'm' || token === 'd' || token === 'H' || token === 'I' || token === 'M' || token === 'S') {
    const raw = input.slice(start, start + 2);
    return /^\d{2}$/.test(raw) ? { raw, value: Number(raw) } : null;
  }
  return null;
}

export function storeEncodedValue(env: WasmEnv, schema: Parameters<typeof serialize>[0], value: unknown): Rid {
  const bytes = serialize(schema, value);
  return env.store.storeEncoded(bytes);
}

export function readEncodedValue<T>(env: WasmEnv, schema: Parameters<typeof deserialize>[0], rid: Rid): T {
  const data = asEncoded(env.store.get(rid));
  if (!data) throw new Error('Invalid descriptor');
  return deserialize(schema, data).value as T;
}
