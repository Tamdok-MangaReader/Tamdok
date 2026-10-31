import { useCallback, useSyncExternalStore } from "react";

import type { InstalledSource } from "@/parsers/shared/types";
import { getEffectiveSourceSettings } from "@/services/source-settings";
import { resolveLibgroupCoverHeaders } from "@/utils/libgroup-image-headers";

type Headers = Record<string, string>;

const store = new Map<string, Headers | undefined>();
const listeners = new Set<() => void>();

function sameHeaders(a: Headers | undefined, b: Headers | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

export async function registerCoverHeaders(
  sources: InstalledSource[],
): Promise<void> {
  let changed = false;
  await Promise.all(
    sources.map(async (source) => {
      let next: Headers | undefined;
      try {
        next = resolveLibgroupCoverHeaders(
          source,
          await getEffectiveSourceSettings(source),
        );
      } catch {
        next = undefined;
      }
      const prev = store.get(source.id);
      if (store.has(source.id) && sameHeaders(prev, next)) return;
      store.set(source.id, sameHeaders(prev, next) && prev ? prev : next);
      changed = true;
    }),
  );
  if (changed) listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStoredCoverHeaders(
  sourceId: string | undefined,
): Headers | undefined {
  const getSnapshot = useCallback(
    () => (sourceId ? store.get(sourceId) : undefined),
    [sourceId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
