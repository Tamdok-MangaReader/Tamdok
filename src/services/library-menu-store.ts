import { useSyncExternalStore } from "react";

import {
  getLibraryCategories,
  getLibraryEntries,
  type LibraryCategory,
  type LibraryEntry,
} from "@/services/library";
import { subscribeMangaData } from "@/utils/manga-events";

export type LibraryMenuSnapshot = {
  entries: Map<string, LibraryEntry>;
  categories: LibraryCategory[];
};

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
