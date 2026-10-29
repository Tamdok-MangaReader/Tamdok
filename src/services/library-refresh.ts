import type { Chapter, InstalledSource, Manga } from "@/parsers/shared/types";
import { flushPreferences } from "@/constants/storage";
import { getMangaDownloads } from "@/services/downloads";
import {
  getLibraryEntries,
  getLibraryUpdateSettings,
  shouldRefreshLibraryEntry,
  updateLibraryEntriesMetadata,
  updateLibraryUpdateSettings,
  chapterKeysForLibraryEntry,
  type LibraryEntry,
  type LibraryEntryMetadata,
} from "@/services/library";
import {
  peekMangaDetailCache,
  readMangaDetailCache,
  writeMangaDetailCache,
} from "@/services/manga-detail-cache";
import { getMangaChapterProgress } from "@/services/manga-tracking";
import { isOnWifi } from "@/services/network";
import {
  notifyNewChapters,
  type NewChapterNotice,
} from "@/services/notifications";
import { setLibraryRefreshProgress } from "@/services/library-refresh-progress";
import {
  findInstalledSource,
  getOrCreateSourceRunner,
  sourceRouteId,
} from "@/services/sources";
import { formatChapterLabel } from "@/utils/chapter-label";

export const BACKGROUND_REFRESH_BUDGET_MS = 60_000;
export const BACKGROUND_ENTRY_TIMEOUT_MS = 20_000;

const FOREGROUND_ENTRY_TIMEOUT_MS = 45_000;
const COMMIT_BATCH_SIZE = 5;

export type LibraryRefreshProgress = {
  title: string;
  current: number;
  total: number;
};

export type LibraryRefreshOptions = {
  automatic?: boolean;
  notify?: boolean;
  silent?: boolean;
  budgetMs?: number;
  entryTimeoutMs?: number;
  minAgeMs?: number;
};

export type LibraryRefreshResult = {
  refreshed: number;
  skipped: number;
  failed: number;
  completed: boolean;
};

type EntryOutcome = {
  metadata: LibraryEntryMetadata;
  notice?: NewChapterNotice;
};

let inFlight: Promise<LibraryRefreshResult> | null = null;

export function isLibraryRefreshRunning(): boolean {
  return inFlight !== null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function countUnreadChapters(
  manga: Manga,
  readChapterKeys: Set<string>,
): number {
  const chapters = manga.chapters ?? [];
  if (chapters.length === 0) return 0;
  return chapters.filter((chapter) => !readChapterKeys.has(chapter.key)).length;
}

function pickLatestChapter(chapters: Chapter[]): Chapter | undefined {
  let best: Chapter | undefined;
  for (const chapter of chapters) {
    if (!best) {
      best = chapter;
      continue;
    }
    if (
      chapter.chapterNumber != null &&
      best.chapterNumber != null &&
      chapter.chapterNumber > best.chapterNumber
    ) {
      best = chapter;
    }
  }
  return best;
}

function lastTouched(entry: LibraryEntry): number {
  return Math.max(entry.lastRefreshed ?? 0, entry.lastAttemptAt ?? 0);
}

async function persistRefreshedManga(
  sourceId: string,
  mangaKey: string,
  updated: Manga,
  refreshMetadata: boolean,
): Promise<void> {
  const existing =
    peekMangaDetailCache(sourceId, mangaKey) ??
    (await readMangaDetailCache(sourceId, mangaKey));
  const previous = existing?.manga;
  await writeMangaDetailCache(sourceId, mangaKey, {
    manga: {
      ...(previous ?? {}),
      ...updated,
      key: mangaKey,
      title: updated.title || previous?.title || "",
      cover: updated.cover || previous?.cover,
      description: refreshMetadata
        ? (updated.description ?? previous?.description)
        : previous?.description,
      tags:
        refreshMetadata && updated.tags?.length ? updated.tags : previous?.tags,
      authors:
        refreshMetadata && updated.authors?.length
          ? updated.authors
          : previous?.authors,
      artists:
        refreshMetadata && updated.artists?.length
          ? updated.artists
          : previous?.artists,
      chapters: updated.chapters ?? previous?.chapters,
    },
    cachedAt: Date.now(),
  });
}

async function refreshEntry(
  entry: LibraryEntry,
  installed: InstalledSource[],
  refreshMetadata: boolean,
  timeoutMs: number,
): Promise<EntryOutcome> {
  const source = findInstalledSource(installed, entry.sourceId);
  if (!source) throw new Error("Source not installed");

  const updated = await withTimeout(
    (async () => {
      const runner = await getOrCreateSourceRunner(source);
      if (!runner.getMangaUpdate)
        throw new Error("Source cannot refresh manga");
      const manga: Manga = {
        key: entry.mangaKey,
        title: entry.title,
        cover: entry.cover,
      };
      return runner.getMangaUpdate(manga, refreshMetadata, true);
    })(),
    timeoutMs,
  );

  const chapters = updated.chapters ?? [];
  const chapterKeys = chapters.map((chapter) => chapter.key);
  const previousKeys = chapterKeysForLibraryEntry(entry);

  if (chapterKeys.length === 0 && previousKeys.length > 0) {
    throw new Error("Empty chapter list");
  }

  const [progress, downloads] = await Promise.all([
    getMangaChapterProgress(entry.sourceId, entry.mangaKey),
    getMangaDownloads(entry.sourceId, entry.mangaKey),
  ]);

  const readChapterKeys = new Set(
    Object.values(progress)
      .filter((item) => item.page === -1)
      .map((item) => item.chapterKey),
  );

  let notice: NewChapterNotice | undefined;
  if (previousKeys.length > 0) {
    const previous = new Set(previousKeys);
    const fresh = chapters.filter((chapter) => !previous.has(chapter.key));
    const allNew = fresh.length === chapters.length;
    if (fresh.length > 0 && !allNew) {
      const latest = pickLatestChapter(fresh);
      if (latest) {
        notice = {
          sourceId: entry.sourceId,
          routeId: sourceRouteId(source),
          mangaKey: entry.mangaKey,
          title: updated.title || entry.title,
          cover: updated.cover || entry.cover,
          latest: formatChapterLabel(latest),
          count: fresh.length,
        };
      }
    }
  }

  try {
    await persistRefreshedManga(
      entry.sourceId,
      entry.mangaKey,
      updated,
      refreshMetadata,
    );
  } catch {}

  const now = Date.now();
  return {
    notice,
    metadata: {
      title: updated.title,
      cover: updated.cover,
      unreadCount: countUnreadChapters(updated, readChapterKeys),
      downloadedCount: downloads.filter((item) => item.status === "completed")
        .length,
      lastRefreshed: now,
      lastAttemptAt: now,
      status: updated.status,
      knownChapterKeys: chapterKeys,
      updateFailed: false,
    },
  };
}

async function runRefresh(
  installed: InstalledSource[],
  categoryId: string | undefined,
  onProgress: ((progress: LibraryRefreshProgress) => void) | undefined,
  options: LibraryRefreshOptions,
): Promise<LibraryRefreshResult> {
  const settings = await getLibraryUpdateSettings();

  if (options.automatic && settings.updateOnWifiOnly && !(await isOnWifi())) {
    return { refreshed: 0, skipped: 0, failed: 0, completed: false };
  }

  const entries = await getLibraryEntries(categoryId);
  const startedAt = Date.now();
  const pending: LibraryEntry[] = [];
  let skipped = 0;

  for (const entry of entries) {
    if (options.minAgeMs != null) {
      const touched = lastTouched(entry);
      if (touched > 0 && startedAt - touched < options.minAgeMs) {
        skipped += 1;
        continue;
      }
    }
    if (await shouldRefreshLibraryEntry(entry)) {
      pending.push(entry);
    } else {
      skipped += 1;
    }
  }

  if (options.automatic) {
    pending.sort((a, b) => lastTouched(a) - lastTouched(b));
  }

  const timeoutMs = options.entryTimeoutMs ?? FOREGROUND_ENTRY_TIMEOUT_MS;
  const deadline =
    options.budgetMs != null ? startedAt + options.budgetMs : null;

  let refreshed = 0;
  let failed = 0;
  let completed = true;
  let batch: Array<{
    sourceId: string;
    mangaKey: string;
    metadata: LibraryEntryMetadata;
  }> = [];
  let notices: NewChapterNotice[] = [];

  const commit = async () => {
    if (batch.length === 0) return;
    const updates = batch;
    const toNotify = notices;
    batch = [];
    notices = [];
    await updateLibraryEntriesMetadata(updates);
    if (options.notify && toNotify.length > 0) {
      await notifyNewChapters(toNotify);
    }
  };

  try {
    for (const [index, entry] of pending.entries()) {
      if (deadline != null && Date.now() >= deadline) {
        completed = false;
        break;
      }

      if (!options.silent) {
        const progress = {
          title: entry.title,
          current: index + 1,
          total: pending.length,
        };
        setLibraryRefreshProgress(progress);
        onProgress?.(progress);
      }

      try {
        const outcome = await refreshEntry(
          entry,
          installed,
          settings.refreshMetadata,
          timeoutMs,
        );
        batch.push({
          sourceId: entry.sourceId,
          mangaKey: entry.mangaKey,
          metadata: outcome.metadata,
        });
        if (outcome.notice) notices.push(outcome.notice);
        refreshed += 1;
      } catch {
        failed += 1;
        batch.push({
          sourceId: entry.sourceId,
          mangaKey: entry.mangaKey,
          metadata: { updateFailed: true, lastAttemptAt: Date.now() },
        });
      }

      if (batch.length >= COMMIT_BATCH_SIZE) await commit();
    }

    await commit();

    if (completed && !categoryId) {
      await updateLibraryUpdateSettings({ lastAutoRefreshAt: Date.now() });
    }

    return { refreshed, skipped, failed, completed };
  } finally {
    if (!options.silent) setLibraryRefreshProgress(null);
    await flushPreferences();
  }
}

export function refreshLibraryEntries(
  installed: InstalledSource[],
  categoryId?: string,
  onProgress?: (progress: LibraryRefreshProgress) => void,
  options: LibraryRefreshOptions = {},
): Promise<LibraryRefreshResult> {
  if (inFlight) return inFlight;
  const run = runRefresh(installed, categoryId, onProgress, options).finally(
    () => {
      inFlight = null;
    },
  );
  inFlight = run;
  return run;
}
