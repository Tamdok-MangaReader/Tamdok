import type { WasmEnv } from '../env';
import { createCanvasImports } from './canvas';
import { createDefaultsImports } from './defaults';
import { createEnvImports } from './env';
import { createHtmlImports } from './html';
import { createJsImports } from './js';
import { createNetImports } from './net';
import { createStdImports } from './std';

// Import namespaces expected by Aidoku modules: env, std, net, html, defaults, canvas, js.
// The module's imports must all be present at instantiation, which is why unsupported
// namespaces (canvas, js) still exist as stubs.
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
