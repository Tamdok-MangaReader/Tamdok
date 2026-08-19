import type { WasmEnv } from '../env';
import { handlePartialResultBytes } from '../partial-results';

export function createEnvImports(env: WasmEnv) {
  return {
    abort: () => {
      env.writeStdout('error: abort called.\n');
    },
    print: (ptr: number, len: number) => {
      try {
        const text = env.readString(ptr, len);
        env.writeStdout(text);
        env.writeStdout('\n');
      } catch {
        env.writeStdout('error: failed to read string for printing.\n');
      }
    },
    sleep: (seconds: number) => {
      const start = Date.now();
      while (Date.now() - start < seconds * 1000) {
        // busy wait
      }
    },
    send_partial_result: (ptr: number) => {
      try {
        const bytes = env.readResultBytes(ptr);
        handlePartialResultBytes(env, bytes);
      } catch {
        // ignore malformed partial payloads
      }
    },
  };
}
