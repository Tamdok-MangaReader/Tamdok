import type { WasmEnv } from '../env';

// The `js` namespace (JavaScript contexts and web views) is not supported. Every function returns -1
// so sources that call it get a clean error instead of a missing-import instantiation failure.
const STUB = -1;

export function createJsImports(_env: WasmEnv) {
  return {
    context_create: () => STUB,
    context_eval: () => STUB,
    context_eval_async: () => STUB,
    context_get: () => STUB,
    webview_create: () => STUB,
    webview_set_rule_list: () => STUB,
    webview_load: () => STUB,
    webview_load_html: () => STUB,
    webview_wait_for_load: () => STUB,
    webview_eval: () => STUB,
    webview_eval_async: () => STUB,
    webview_add_user_script: () => STUB,
    webview_get_cookies: () => STUB,
    webview_delete_cookie: () => STUB,
  };
}
