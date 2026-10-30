import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { t } from '@/constants/locales';
import { getAppSettings } from '@/services/app-settings';
import type { LibraryRefreshProgress } from '@/services/library-refresh';

type LibraryLiveActivityNative = {
  start: (title: string, subtitle: string, current: number, total: number) => Promise<string | null>;
  update: (id: string, title: string, subtitle: string, current: number, total: number) => Promise<void>;
  end: (id: string) => Promise<void>;
};

export type ReadingActivity = {
  mangaTitle: string;
  chapterLabel: string;
  page: number;
  total: number;
};

type Payload = { title: string; subtitle: string; current: number; total: number };

const READING_THROTTLE_MS = 700;

const native = requireOptionalNativeModule<LibraryLiveActivityNative>('LibraryLiveActivity');

let activityId: string | null = null;
let lastPayload: Payload | null = null;
let refreshState: LibraryRefreshProgress | null = null;
let readingState: ReadingActivity | null = null;
let queue: Promise<void> = Promise.resolve();
let readingTimer: ReturnType<typeof setTimeout> | null = null;

function samePayload(a: Payload | null, b: Payload): boolean {
  return (
    !!a &&
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.current === b.current &&
    a.total === b.total
  );
}

async function apply(): Promise<void> {
  if (Platform.OS !== 'ios' || !native) return;

  try {
    const settings = await getAppSettings();
    const refreshEnabled = settings.libraryDisplay.showLibraryRefreshLiveActivity ?? true;
    const readingEnabled = settings.reader.showReadingLiveActivity ?? true;

    let next: Payload | null = null;
    if (refreshEnabled && refreshState) {
      next = {
        title: t('library_updating'),
        subtitle: refreshState.title,
        current: refreshState.current,
        total: refreshState.total,
      };
    } else if (readingEnabled && readingState && readingState.total > 0) {
      next = {
        title: t('reader_live_activity_title'),
        subtitle: `${readingState.mangaTitle} · ${readingState.chapterLabel}`,
        current: readingState.page,
        total: readingState.total,
      };
    }

    if (!next) {
      lastPayload = null;
      if (!activityId) return;
      const id = activityId;
      activityId = null;
      await native.end(id);
      return;
    }

    if (samePayload(lastPayload, next) && activityId) return;
    lastPayload = next;

    if (!activityId) {
      activityId = (await native.start(next.title, next.subtitle, next.current, next.total)) ?? null;
      return;
    }

    await native.update(activityId, next.title, next.subtitle, next.current, next.total);
  } catch {
    activityId = null;
    lastPayload = null;
  }
}

function enqueue(): Promise<void> {
  queue = queue.then(apply, apply);
  return queue;
}

export function syncLibraryRefreshLiveActivity(progress: LibraryRefreshProgress | null): Promise<void> {
  refreshState = progress;
  return enqueue();
}

export function syncReadingLiveActivity(reading: ReadingActivity | null): void {
  readingState = reading;
  if (readingTimer) clearTimeout(readingTimer);
  if (!reading) {
    readingTimer = null;
    void enqueue();
    return;
  }
  readingTimer = setTimeout(() => {
    readingTimer = null;
    void enqueue();
  }, READING_THROTTLE_MS);
}
