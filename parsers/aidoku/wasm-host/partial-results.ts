import { deserialize } from '@variegated-coffee/serde-postcard-ts';

import type { WasmEnv } from './env';
import { HomePartialResultSchema, HomeLayoutSchema, MangaSchema, type PostcardHomeLayout } from './schemas';

function decodePostcard<T>(schema: Parameters<typeof deserialize>[0], bytes: Uint8Array): T | null {
  try {
    return (deserialize(schema, bytes) as { value: T }).value;
  } catch {
    return null;
  }
}

// Aidoku can stream home layout pieces before the final postcard arrives.
function mergeHomeComponent(layout: PostcardHomeLayout, component: PostcardHomeLayout['components'][number]): void {
  const title = component.title ?? null;
  const index = layout.components.findIndex((entry) => (entry.title ?? null) === title);
  if (index >= 0) {
    layout.components[index] = component;
    return;
  }
  layout.components.push(component);
}

export function resetPartialResults(env: WasmEnv): void {
  env.homePartialLayout = null;
  env.partialMangaResults = [];
}

export function handlePartialResultBytes(env: WasmEnv, bytes: Uint8Array): void {
  const homePartial = decodePostcard<{ type: string; value: unknown }>(HomePartialResultSchema, bytes);
  if (homePartial) {
    if (homePartial.type === 'Layout') {
      env.homePartialLayout = homePartial.value as PostcardHomeLayout;
      return;
    }
    if (homePartial.type === 'Component') {
      if (!env.homePartialLayout) {
        env.homePartialLayout = { components: [] };
      }
      mergeHomeComponent(env.homePartialLayout, homePartial.value as PostcardHomeLayout['components'][number]);
      return;
    }
  }

  const layoutOnly = decodePostcard<PostcardHomeLayout>(HomeLayoutSchema, bytes);
  if (layoutOnly?.components) {
    env.homePartialLayout = layoutOnly;
    return;
  }

  const partialManga = decodePostcard(MangaSchema, bytes);
  if (partialManga && 'key' in partialManga && 'title' in partialManga) {
    env.partialMangaResults.push(partialManga);
  }
}

/** Stitch streamed partial home components onto the final layout decode. */
export function resolveHomeLayout(
  env: WasmEnv,
  finalLayout: PostcardHomeLayout,
): PostcardHomeLayout {
  if (!env.homePartialLayout) {
    return finalLayout;
  }
  if (finalLayout.components.length === 0) {
    return env.homePartialLayout;
  }

  const merged: PostcardHomeLayout = {
    components: finalLayout.components.map((component) => ({ ...component })),
  };
  for (const component of env.homePartialLayout.components) {
    mergeHomeComponent(merged, component);
  }
  return merged;
}
