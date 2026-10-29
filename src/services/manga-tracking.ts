import {
  getValue,
  getValueSerialized,
  setValue,
  storageKeys,
} from "@/constants/storage";
import { getAppSettings } from "@/services/app-settings";
import { notifyMangaDataChanged } from "@/utils/manga-events";

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

type HistoryMeta = Pick<
  HistoryEntry,
  "mangaTitle" | "chapterTitle" | "cover"
> & {
  notify?: boolean;
};

const NOTIFY_DELAY_MS = 80;
const LIBRARY_SYNC_DELAY_MS = 150;

let mutationTail: Promise<unknown> = Promise.resolve();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleNotify(): void {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    notifyMangaDataChanged();
  }, NOTIFY_DELAY_MS);
}

function chapterKey(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
): string {
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

function upsertChapterHistory(store: TrackingStore, entry: HistoryEntry): void {
  removeChapterHistory(store, entry.sourceId, entry.mangaKey, entry.chapterKey);
  store.history.unshift(entry);
}

let trackingCache: { raw: string | undefined; store: TrackingStore } | null =
  null;

async function readStore(): Promise<TrackingStore> {
  const raw = await getValueSerialized(storageKeys.MANGA_TRACKING);
  if (trackingCache && trackingCache.raw === raw) return trackingCache.store;
  const stored = await getValue<Partial<TrackingStore>>(
    storageKeys.MANGA_TRACKING,
    {},
  );
  const store: TrackingStore = {
    chapters: stored?.chapters ?? {},
    history: Array.isArray(stored?.history) ? stored.history : [],
  };
  trackingCache = { raw, store };
  return store;
}

function mutateStore(
  apply: (store: TrackingStore) => boolean,
  notify = true,
): Promise<boolean> {
  const run = mutationTail.then(async () => {
    const store = await readStore();
    if (!apply(store)) return false;
    await setValue(storageKeys.MANGA_TRACKING, store);
    trackingCache = {
      raw: await getValueSerialized(storageKeys.MANGA_TRACKING),
      store,
    };
    if (notify) scheduleNotify();
    return true;
  });
  mutationTail = run.catch(() => undefined);
  return run;
}

async function trackingWritesDisabled(): Promise<boolean> {
  const settings = await getAppSettings();
  return settings.incognitoMode;
}

function scheduleLibraryUnreadSync(sourceId: string, mangaKey: string) {
  const key = mangaHistoryKey(sourceId, mangaKey);
  const existing = syncTimers.get(key);
  if (existing) clearTimeout(existing);
  syncTimers.set(
    key,
    setTimeout(() => {
      syncTimers.delete(key);
      void import("@/services/library")
        .then((mod) => mod.syncLibraryEntryUnread(sourceId, mangaKey))
        .catch(() => undefined);
    }, LIBRARY_SYNC_DELAY_MS),
  );
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
  const progress = await getChapterProgress(
    sourceId,
    mangaKey,
    chapterKeyValue,
  );
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

export async function getReadChapterKeysByManga(): Promise<
  Map<string, Set<string>>
> {
  const store = await readStore();
  const map = new Map<string, Set<string>>();
  for (const progress of Object.values(store.chapters)) {
    if (progress.page !== -1) continue;
    const key = `${progress.sourceId}:${progress.mangaKey}`;
    const set = map.get(key) ?? new Set<string>();
    set.add(progress.chapterKey);
    map.set(key, set);
  }
  return map;
}

export async function markChapterRead(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
  meta?: HistoryMeta,
): Promise<void> {
  if (await trackingWritesDisabled()) return;
  const now = Date.now();
  await mutateStore((store) => {
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
    return true;
  }, meta?.notify !== false);
  scheduleLibraryUnreadSync(sourceId, mangaKey);
}

export async function markChapterUnread(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
): Promise<void> {
  await mutateStore((store) => {
    delete store.chapters[chapterKey(sourceId, mangaKey, chapterKeyValue)];
    removeChapterHistory(store, sourceId, mangaKey, chapterKeyValue);
    return true;
  });
  scheduleLibraryUnreadSync(sourceId, mangaKey);
}

export async function markAllChaptersRead(
  sourceId: string,
  mangaKey: string,
  chapterKeys: string[],
  meta?: Pick<HistoryEntry, "mangaTitle" | "cover">,
): Promise<void> {
  if (chapterKeys.length === 0) return;
  if (await trackingWritesDisabled()) return;
  const now = Date.now();
  const changed = await mutateStore((store) => {
    const fresh: HistoryEntry[] = [];
    const touched = new Set<string>();
    for (const chapterKeyValue of chapterKeys) {
      if (touched.has(chapterKeyValue)) continue;
      const key = chapterKey(sourceId, mangaKey, chapterKeyValue);
      if (store.chapters[key]?.page === -1) continue;
      touched.add(chapterKeyValue);
      store.chapters[key] = {
        sourceId,
        mangaKey,
        chapterKey: chapterKeyValue,
        page: -1,
        dateRead: now,
      };
      fresh.push({
        sourceId,
        mangaKey,
        chapterKey: chapterKeyValue,
        mangaTitle: meta?.mangaTitle ?? mangaKey,
        cover: meta?.cover,
        dateRead: now,
        page: -1,
      });
    }
    if (fresh.length === 0) return false;
    store.history = [
      ...fresh,
      ...store.history.filter(
        (entry) =>
          !(
            entry.sourceId === sourceId &&
            entry.mangaKey === mangaKey &&
            touched.has(entry.chapterKey)
          ),
      ),
    ];
    return true;
  });
  if (changed) scheduleLibraryUnreadSync(sourceId, mangaKey);
}

export async function markAllChaptersUnread(
  sourceId: string,
  mangaKey: string,
  chapterKeys: string[],
): Promise<void> {
  if (chapterKeys.length === 0) return;
  const keySet = new Set(chapterKeys);
  const changed = await mutateStore((store) => {
    let didChange = false;
    for (const chapterKeyValue of keySet) {
      const key = chapterKey(sourceId, mangaKey, chapterKeyValue);
      if (key in store.chapters) {
        delete store.chapters[key];
        didChange = true;
      }
    }
    const before = store.history.length;
    store.history = store.history.filter(
      (entry) =>
        !(
          entry.sourceId === sourceId &&
          entry.mangaKey === mangaKey &&
          keySet.has(entry.chapterKey)
        ),
    );
    return didChange || store.history.length !== before;
  });
  if (changed) scheduleLibraryUnreadSync(sourceId, mangaKey);
}

export async function recordChapterProgress(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
  page: number,
  meta?: HistoryMeta,
): Promise<void> {
  if (await trackingWritesDisabled()) return;
  const now = Date.now();
  await mutateStore((store) => {
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
    return true;
  }, meta?.notify !== false);
  if (page === -1) scheduleLibraryUnreadSync(sourceId, mangaKey);
}

export async function getMangaHistoryForEntry(
  sourceId: string,
  mangaKey: string,
): Promise<HistoryEntry[]> {
  const store = await readStore();
  const key = mangaHistoryKey(sourceId, mangaKey);
  return store.history.filter(
    (entry) => mangaHistoryKey(entry.sourceId, entry.mangaKey) === key,
  );
}

export async function getHistoryEntries(
  limit?: number,
): Promise<HistoryEntry[]> {
  const store = await readStore();
  const historyKeys = new Set(
    store.history.map(
      (entry) => `${entry.sourceId}:${entry.mangaKey}:${entry.chapterKey}`,
    ),
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
    if (entry.cover) {
      coverByManga.set(
        mangaHistoryKey(entry.sourceId, entry.mangaKey),
        entry.cover,
      );
    }
  }

  const sorted = merged
    .sort((a, b) => b.dateRead - a.dateRead)
    .map((entry) => {
      const progress =
        store.chapters[
          chapterKey(entry.sourceId, entry.mangaKey, entry.chapterKey)
        ];
      return {
        ...entry,
        page: entry.page ?? progress?.page,
        cover:
          entry.cover ??
          coverByManga.get(mangaHistoryKey(entry.sourceId, entry.mangaKey)),
      };
    });
  if (limit == null) return sorted;
  return sorted.slice(0, limit);
}

export async function clearHistory(): Promise<void> {
  await removeHistorySince(0);
}

export async function removeHistorySince(cutoffMs: number): Promise<void> {
  await mutateStore((store) => {
    const removed = store.history.filter((entry) => entry.dateRead >= cutoffMs);
    store.history = store.history.filter((entry) => entry.dateRead < cutoffMs);

    for (const entry of removed) {
      delete store.chapters[
        chapterKey(entry.sourceId, entry.mangaKey, entry.chapterKey)
      ];
    }

    for (const [key, progress] of Object.entries(store.chapters)) {
      if (progress.dateRead >= cutoffMs) {
        delete store.chapters[key];
      }
    }
    return true;
  });
}

export async function removeChapterFromHistory(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
): Promise<void> {
  await mutateStore((store) => {
    removeChapterHistory(store, sourceId, mangaKey, chapterKeyValue);
    delete store.chapters[chapterKey(sourceId, mangaKey, chapterKeyValue)];
    return true;
  });
}

export async function removeMangaHistoryGroup(
  sourceId: string,
  mangaKey: string,
  chapterKeys: string[],
): Promise<void> {
  const chapterKeySet = new Set(chapterKeys);
  await mutateStore((store) => {
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
    return true;
  });
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

  let latest = entries[0]!;
  for (const entry of entries) {
    if (entry.dateRead > latest.dateRead) latest = entry;
  }

  return {
    chapterKey: latest.chapterKey,
    page: latest.page >= 0 ? latest.page : 0,
  };
}
