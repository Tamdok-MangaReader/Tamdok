import { getValue, setValue, storageKeys } from '@/constants/storage';
import { getAppSettings } from '@/services/app-settings';
import { notifyMangaDataChanged } from '@/utils/manga-events';

export type ChapterProgress = {
  sourceId: string;
  mangaKey: string;
  chapterKey: string;
  page: number;
  dateRead: number;
};

export type HistoryEntry = {
  sourceId: string;
  mangaKey: string;
  chapterKey: string;
  mangaTitle: string;
  chapterTitle?: string;
  cover?: string;
  dateRead: number;
  page?: number;
};

type TrackingStore = {
  chapters: Record<string, ChapterProgress>;
  history: HistoryEntry[];
};

function chapterKey(sourceId: string, mangaKey: string, chapterKey: string): string {
  return `${sourceId}:${mangaKey}:${chapterKey}`;
}

function mangaHistoryKey(sourceId: string, mangaKey: string): string {
  return `${sourceId}:${mangaKey}`;
}

function removeChapterHistory(
  store: TrackingStore,
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
): void {
  store.history = store.history.filter(
    (entry) =>
      !(
        entry.sourceId === sourceId &&
        entry.mangaKey === mangaKey &&
        entry.chapterKey === chapterKeyValue
      ),
  );
}

function upsertChapterHistory(
  store: TrackingStore,
  entry: HistoryEntry,
): void {
  removeChapterHistory(store, entry.sourceId, entry.mangaKey, entry.chapterKey);
  store.history.unshift(entry);
}

async function readStore(): Promise<TrackingStore> {
  return getValue<TrackingStore>(storageKeys.MANGA_TRACKING, { chapters: {}, history: [] });
}

async function writeStore(store: TrackingStore, notify = true): Promise<void> {
  await setValue(storageKeys.MANGA_TRACKING, store);
  if (notify) notifyMangaDataChanged();
}

async function trackingWritesDisabled(): Promise<boolean> {
  const settings = await getAppSettings();
  // Incognito skips progress/history writes but reads still work.
  return settings.incognitoMode;
}

export async function getChapterProgress(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
): Promise<ChapterProgress | undefined> {
  const store = await readStore();
  return store.chapters[chapterKey(sourceId, mangaKey, chapterKeyValue)];
}

export async function isChapterRead(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
): Promise<boolean> {
  const progress = await getChapterProgress(sourceId, mangaKey, chapterKeyValue);
  return progress?.page === -1;
}

export async function getMangaChapterProgress(
  sourceId: string,
  mangaKey: string,
): Promise<Record<string, ChapterProgress>> {
  const store = await readStore();
  const prefix = `${sourceId}:${mangaKey}:`;
  const result: Record<string, ChapterProgress> = {};
  for (const [key, value] of Object.entries(store.chapters)) {
    if (key.startsWith(prefix)) {
      result[value.chapterKey] = value;
    }
  }
  return result;
}

export async function markChapterRead(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
  meta?: Pick<HistoryEntry, 'mangaTitle' | 'chapterTitle' | 'cover'> & { notify?: boolean },
): Promise<void> {
  if (await trackingWritesDisabled()) return;
  const store = await readStore();
  const now = Date.now();
  const key = chapterKey(sourceId, mangaKey, chapterKeyValue);
  const existing = store.chapters[key];
    store.chapters[key] = {
      sourceId,
      mangaKey,
      chapterKey: chapterKeyValue,
      page: -1,
      dateRead: existing?.dateRead ?? now,
    };

    upsertChapterHistory(store, {
      sourceId,
      mangaKey,
      chapterKey: chapterKeyValue,
      mangaTitle: meta?.mangaTitle ?? mangaKey,
      chapterTitle: meta?.chapterTitle,
      cover: meta?.cover,
      dateRead: now,
      page: -1,
    });

  await writeStore(store, meta?.notify !== false);
}

export async function markChapterUnread(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
): Promise<void> {
  const store = await readStore();
  delete store.chapters[chapterKey(sourceId, mangaKey, chapterKeyValue)];
  removeChapterHistory(store, sourceId, mangaKey, chapterKeyValue);
  await writeStore(store);
}

export async function markAllChaptersRead(
  sourceId: string,
  mangaKey: string,
  chapterKeys: string[],
  meta?: Pick<HistoryEntry, 'mangaTitle' | 'cover'>,
): Promise<void> {
  if (chapterKeys.length === 0) return;
  if (await trackingWritesDisabled()) return;
  const store = await readStore();
  const now = Date.now();
  for (const chapterKeyValue of chapterKeys) {
    store.chapters[chapterKey(sourceId, mangaKey, chapterKeyValue)] = {
      sourceId,
      mangaKey,
      chapterKey: chapterKeyValue,
      page: -1,
      dateRead: now,
    };
  }

  store.history = store.history.filter((entry) => mangaHistoryKey(entry.sourceId, entry.mangaKey) !== mangaHistoryKey(sourceId, mangaKey));
  for (let index = chapterKeys.length - 1; index >= 0; index -= 1) {
    const chapterKeyValue = chapterKeys[index]!;
    store.history.unshift({
      sourceId,
      mangaKey,
      chapterKey: chapterKeyValue,
      mangaTitle: meta?.mangaTitle ?? mangaKey,
      cover: meta?.cover,
      dateRead: now,
    });
  }

  await writeStore(store);
}

export async function markAllChaptersUnread(sourceId: string, mangaKey: string, chapterKeys: string[]): Promise<void> {
  const store = await readStore();
  for (const chapterKeyValue of chapterKeys) {
    delete store.chapters[chapterKey(sourceId, mangaKey, chapterKeyValue)];
  }
  const historyKey = mangaHistoryKey(sourceId, mangaKey);
  store.history = store.history.filter((entry) => mangaHistoryKey(entry.sourceId, entry.mangaKey) !== historyKey);
  await writeStore(store);
}

export async function recordChapterProgress(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
  page: number,
  meta?: Pick<HistoryEntry, 'mangaTitle' | 'chapterTitle' | 'cover'> & { notify?: boolean },
): Promise<void> {
  if (await trackingWritesDisabled()) return;
  const store = await readStore();
  const now = Date.now();
  const key = chapterKey(sourceId, mangaKey, chapterKeyValue);
    store.chapters[key] = {
      sourceId,
      mangaKey,
      chapterKey: chapterKeyValue,
      page,
      dateRead: now,
    };

    upsertChapterHistory(store, {
      sourceId,
      mangaKey,
      chapterKey: chapterKeyValue,
      mangaTitle: meta?.mangaTitle ?? mangaKey,
      chapterTitle: meta?.chapterTitle,
      cover: meta?.cover,
      dateRead: now,
      page,
    });

  await writeStore(store, meta?.notify !== false);
}

export async function getMangaHistoryForEntry(sourceId: string, mangaKey: string): Promise<HistoryEntry[]> {
  const store = await readStore();
  const key = mangaHistoryKey(sourceId, mangaKey);
  return store.history.filter((entry) => mangaHistoryKey(entry.sourceId, entry.mangaKey) === key);
}

export async function getHistoryEntries(limit?: number): Promise<HistoryEntry[]> {
  const store = await readStore();
  const historyKeys = new Set(
    store.history.map((entry) => `${entry.sourceId}:${entry.mangaKey}:${entry.chapterKey}`),
  );
  const merged = [...store.history];

  for (const progress of Object.values(store.chapters)) {
    const key = `${progress.sourceId}:${progress.mangaKey}:${progress.chapterKey}`;
    if (historyKeys.has(key)) continue;
    merged.push({
      sourceId: progress.sourceId,
      mangaKey: progress.mangaKey,
      chapterKey: progress.chapterKey,
      mangaTitle: progress.mangaKey,
      dateRead: progress.dateRead,
      page: progress.page,
    });
  }

  const coverByManga = new Map<string, string>();
  for (const entry of store.history) {
    if (entry.cover) coverByManga.set(mangaHistoryKey(entry.sourceId, entry.mangaKey), entry.cover);
  }

  const sorted = merged.sort((a, b) => b.dateRead - a.dateRead).map((entry) => {
    const progress = store.chapters[chapterKey(entry.sourceId, entry.mangaKey, entry.chapterKey)];
    return {
      ...entry,
      page: entry.page ?? progress?.page,
      cover: entry.cover ?? coverByManga.get(mangaHistoryKey(entry.sourceId, entry.mangaKey)),
    };
  });
  if (limit == null) return sorted;
  return sorted.slice(0, limit);
}

export async function clearHistory(): Promise<void> {
  await removeHistorySince(0);
}

export async function removeHistorySince(cutoffMs: number): Promise<void> {
  const store = await readStore();
  const removed = store.history.filter((entry) => entry.dateRead >= cutoffMs);
  store.history = store.history.filter((entry) => entry.dateRead < cutoffMs);

  for (const entry of removed) {
    delete store.chapters[chapterKey(entry.sourceId, entry.mangaKey, entry.chapterKey)];
  }

  for (const [key, progress] of Object.entries(store.chapters)) {
    if (progress.dateRead >= cutoffMs) {
      delete store.chapters[key];
    }
  }

  await writeStore(store);
}

export async function removeChapterFromHistory(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
): Promise<void> {
  const store = await readStore();
  removeChapterHistory(store, sourceId, mangaKey, chapterKeyValue);
  delete store.chapters[chapterKey(sourceId, mangaKey, chapterKeyValue)];
  await writeStore(store);
}

export async function removeMangaHistoryGroup(
  sourceId: string,
  mangaKey: string,
  chapterKeys: string[],
): Promise<void> {
  const store = await readStore();
  const chapterKeySet = new Set(chapterKeys);

  store.history = store.history.filter(
    (entry) =>
      !(
        entry.sourceId === sourceId &&
        entry.mangaKey === mangaKey &&
        chapterKeySet.has(entry.chapterKey)
      ),
  );

  for (const chapterKeyValue of chapterKeys) {
    delete store.chapters[chapterKey(sourceId, mangaKey, chapterKeyValue)];
  }

  await writeStore(store);
}

export type MangaReadingResume = {
  chapterKey: string;
  chapterTitle?: string;
  page: number;
};

export async function getMangaReadingResume(
  sourceId: string,
  mangaKey: string,
): Promise<MangaReadingResume | null> {
  const progress = await getMangaChapterProgress(sourceId, mangaKey);
  const entries = Object.values(progress);
  if (entries.length === 0) return null;

  const latest = [...entries].sort((a, b) => b.dateRead - a.dateRead)[0];
  if (!latest) return null;

  return {
    chapterKey: latest.chapterKey,
    page: latest.page >= 0 && latest.page !== -1 ? latest.page : 0,
  };
}
