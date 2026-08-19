export type WasmLogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<WasmLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Only warn/error are printed; debug/info are dropped silently. */
const MIN_VISIBLE_LEVEL: WasmLogLevel = 'warn';

export function logAidokuWasm(level: WasmLogLevel, message: string): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_VISIBLE_LEVEL]) {
    return;
  }
  console.warn(`[Aidoku WASM] ${message}`);
}

export function postAidokuWasmLog(
  post: (message: Record<string, unknown>) => void,
  level: WasmLogLevel,
  message: string,
): void {
  post({ type: 'log', level, message });
}
