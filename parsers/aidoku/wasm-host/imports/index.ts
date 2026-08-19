import type { WasmEnv } from '../env';
import { createCanvasImports } from './canvas';
import { createDefaultsImports } from './defaults';
import { createEnvImports } from './env';
import { createHtmlImports } from './html';
import { createJsImports } from './js';
import { createNetImports } from './net';
import { createStdImports } from './std';

export function createWasmImports(env: WasmEnv): WebAssembly.Imports {
  return {
    env: createEnvImports(env),
    std: createStdImports(env),
    net: createNetImports(env),
    html: createHtmlImports(env),
    defaults: createDefaultsImports(env),
    canvas: createCanvasImports(env),
    js: createJsImports(env),
  };
}
