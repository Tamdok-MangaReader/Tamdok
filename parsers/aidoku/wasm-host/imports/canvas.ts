import type { WasmEnv } from '../env';

// The `canvas` namespace (image compositing, used by a few sources to descramble pages) is not
// implemented. Stubs keep instantiation working; calls fail with -1.
const STUB = -1;

export function createCanvasImports(_env: WasmEnv) {
  return {
    new_context: () => STUB,
    set_transform: () => STUB,
    draw_image: () => STUB,
    copy_image: () => STUB,
    fill: () => STUB,
    stroke: () => STUB,
    draw_text: () => STUB,
    get_image: () => STUB,
    new_font: () => STUB,
    system_font: () => STUB,
    load_font: () => STUB,
    new_image: () => STUB,
    get_image_data: () => STUB,
    get_image_width: () => STUB,
    get_image_height: () => STUB,
  };
}
