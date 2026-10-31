import { useSyncExternalStore } from "react";

import {
  getLibraryCategories,
  getLibraryEntries,
  type LibraryCategory,
  type LibraryEntry,
} from "@/services/library";
import { subscribeMangaData } from "@/utils/manga-events";

// Shared, read-only snapshot of the library for the manga context menus.
// Every cover in a grid needs to know "is this in the library and in which categories?". Loading that
// per cover would be expensive, so one module-level store loads it once and all covers read from it.
export type LibraryMenuSnapshot = {
  entries: Map<string, LibraryEntry>;
  categories: LibraryCategory[];
};

// Keys ignore the runtime prefix (aidoku:/tamdok:) so ids from different places compare equal.
const SOURCE_PREFIX = /^(aidoku|tamdok):/;

export function libraryMenuKey(sourceId: string, mangaKey: string): string {
  return `${sourceId.replace(SOURCE_PREFIX, "")}:${mangaKey}`;
}

let snapshot: LibraryMenuSnapshot = { entries: new Map(), categories: [] };
let signature = "";
const listeners = new Set<() => void>();
let unsubscribeEvents: (() => void) | null = null;
let loading = false;
let dirty = false;
let lastReloadAt = 0;
let trailingTimer: ReturnType<typeof setTimeout> | null = null;

// Reloads are throttled (leading + one trailing call) because manga-data events can arrive in bursts.
const RELOAD_MIN_INTERVAL_MS = 1000;

function scheduleReload(): void {
  const wait = RELOAD_MIN_INTERVAL_MS - (Date.now() - lastReloadAt);
  if (wait <= 0) {
    void reload();
    return;
  }
  if (trailingTimer) return;
  trailingTimer = setTimeout(() => {
    trailingTimer = null;
    void reload();
  }, wait);
}

// Cheap fingerprint of the data the menus care about. The snapshot object (and therefore every
// subscriber) only changes when this fingerprint changes.
function signatureOf(
  entries: LibraryEntry[],
  categories: LibraryCategory[],
): string {
  return (
    entries
      .map(
        (entry) =>
          `${entry.sourceId}:${entry.mangaKey}:${entry.categoryIds.join(",")}:${(entry.knownChapterKeys ?? []).length}`,
      )
      .join("|") +
    "#" +
    categories.map((category) => `${category.id}:${category.name}`).join("|")
  );
}

// `loading`/`dirty` ensure only one reload runs at a time and one more follows if events arrived meanwhile.
async function reload(): Promise<void> {
  if (loading) {
    dirty = true;
    return;
  }
  loading = true;
  lastReloadAt = Date.now();
  try {
    const [entries, categories] = await Promise.all([
      getLibraryEntries(),
      getLibraryCategories(),
    ]);
    const next = signatureOf(entries, categories);
    if (next !== signature) {
      signature = next;
      snapshot = {
        entries: new Map(
          entries.map((entry) => [
            libraryMenuKey(entry.sourceId, entry.mangaKey),
            entry,
          ]),
        ),
        categories: [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
      };
      listeners.forEach((listener) => listener());
    }
  } finally {
    loading = false;
    if (dirty) {
      dirty = false;
      void reload();
    }
  }
}

// Event listening starts with the first subscriber and stops with the last.
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!unsubscribeEvents) {
    unsubscribeEvents = subscribeMangaData(scheduleReload);
    void reload();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeEvents) {
      unsubscribeEvents();
      unsubscribeEvents = null;
    }
  };
}

export function useLibraryMenuSnapshot(): LibraryMenuSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
