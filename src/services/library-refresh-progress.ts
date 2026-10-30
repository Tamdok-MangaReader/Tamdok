import { useSyncExternalStore } from 'react';

import type { LibraryRefreshProgress } from '@/services/library-refresh';
import { syncLibraryRefreshLiveActivity } from '@/services/library-live-activity';
import { subscribeAppSettings } from '@/utils/app-settings-events';

type Listener = (progress: LibraryRefreshProgress | null) => void;

let current: LibraryRefreshProgress | null = null;
const listeners = new Set<Listener>();

export function getLibraryRefreshProgress(): LibraryRefreshProgress | null {
  return current;
}

export function setLibraryRefreshProgress(progress: LibraryRefreshProgress | null): void {
  current = progress;
  listeners.forEach((listener) => listener(progress));
  void syncLibraryRefreshLiveActivity(progress);
}

export function subscribeLibraryRefreshProgress(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

const queued = new Set<string>();
const keyListeners = new Map<string, Set<() => void>>();

function entryId(sourceId: string, mangaKey: string): string {
  return `${sourceId}\u0000${mangaKey}`;
}

function emitKeys(ids: Iterable<string>): void {
  for (const id of ids) {
    keyListeners.get(id)?.forEach((listener) => listener());
  }
}

export function setLibraryRefreshQueue(entries: Array<{ sourceId: string; mangaKey: string }>): void {
  const previous = [...queued];
  queued.clear();
  for (const entry of entries) queued.add(entryId(entry.sourceId, entry.mangaKey));
  emitKeys(new Set([...previous, ...queued]));
}

export function markLibraryRefreshEntryDone(sourceId: string, mangaKey: string): void {
  const id = entryId(sourceId, mangaKey);
  if (queued.delete(id)) emitKeys([id]);
}

export function clearLibraryRefreshQueue(): void {
  const previous = [...queued];
  queued.clear();
  emitKeys(previous);
}

export function useLibraryEntryRefreshing(sourceId: string | undefined, mangaKey: string): boolean {
  const id = sourceId ? entryId(sourceId, mangaKey) : null;
  return useSyncExternalStore(
    (listener) => {
      if (!id) return () => {};
      let set = keyListeners.get(id);
      if (!set) {
        set = new Set();
        keyListeners.set(id, set);
      }
      set.add(listener);
      return () => {
        set?.delete(listener);
        if (set && set.size === 0) keyListeners.delete(id);
      };
    },
    () => (id ? queued.has(id) : false),
    () => false,
  );
}

subscribeAppSettings(() => {
  void syncLibraryRefreshLiveActivity(current);
});
