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

subscribeAppSettings(() => {
  void syncLibraryRefreshLiveActivity(current);
});
