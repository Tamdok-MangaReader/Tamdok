import { useSyncExternalStore } from 'react';

import { getAppSettings, type CoverDisplaySettings } from '@/services/app-settings';
import { subscribeAppSettings } from '@/utils/app-settings-events';

const listeners = new Set<() => void>();
let snapshot: CoverDisplaySettings = { showStatusBadge: true, showRating: true };
let started = false;

async function load(): Promise<void> {
  const { coverDisplay } = await getAppSettings();
  if (
    coverDisplay.showStatusBadge === snapshot.showStatusBadge &&
    coverDisplay.showRating === snapshot.showRating
  ) {
    return;
  }
  snapshot = { showStatusBadge: coverDisplay.showStatusBadge, showRating: coverDisplay.showRating };
  for (const listener of listeners) listener();
}

function start(): void {
  if (started) return;
  started = true;
  void load();
  subscribeAppSettings(() => {
    void load();
  });
}

function subscribe(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CoverDisplaySettings {
  return snapshot;
}

export function useCoverDisplay(): CoverDisplaySettings {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
