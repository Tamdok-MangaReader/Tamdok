import type { InstalledSource, Manga } from '@/parsers/shared/types';
import type { SourceRunner } from '@/parsers/shared/source-runner';
import { getMangaDownloads } from '@/services/downloads';
import {
  getLibraryEntries,
  getLibraryUpdateSettings,
  shouldRefreshLibraryEntry,
  updateLibraryEntryMetadata,
  type LibraryEntry,
} from '@/services/library';
import { getMangaChapterProgress } from '@/services/manga-tracking';
import { notifyNewChaptersAvailable } from '@/services/notifications';
import { createSourceRunner, findInstalledSource } from '@/services/sources';

function countUnreadChapters(manga: Manga, readChapterKeys: Set<string>): number {
  const chapters = manga.chapters ?? [];
  if (chapters.length === 0) return 0;
  return chapters.filter((chapter) => !readChapterKeys.has(chapter.key)).length;
}

async function refreshEntry(
  entry: LibraryEntry,
  installed: InstalledSource[],
  runnerCache: Map<string, SourceRunner>,
  refreshMetadata: boolean,
): Promise<void> {
  const source = findInstalledSource(installed, entry.sourceId);
  if (!source) throw new Error('Source not installed');

  let runner = runnerCache.get(source.id);
  if (!runner) {
    runner = await createSourceRunner(source);
    runnerCache.set(source.id, runner);
  }

  const manga: Manga = {
    key: entry.mangaKey,
    title: entry.title,
    cover: entry.cover,
  };

  if (!runner.getMangaUpdate) throw new Error('Source cannot refresh manga');

  const updated = await runner.getMangaUpdate(manga, refreshMetadata, true);
  const [progress, downloads] = await Promise.all([
    getMangaChapterProgress(entry.sourceId, entry.mangaKey),
    getMangaDownloads(entry.sourceId, entry.mangaKey),
  ]);

  const readChapterKeys = new Set(
    Object.values(progress)
      .filter((item) => item.page === -1)
      .map((item) => item.chapterKey),
  );

  const chapterKeys = (updated.chapters ?? []).map((chapter) => chapter.key);
  const previousKeys = entry.knownChapterKeys ?? [];
  const newChapterKeys =
    previousKeys.length > 0 ? chapterKeys.filter((key) => !previousKeys.includes(key)) : [];

  if (newChapterKeys.length > 0) {
    const newestKey = newChapterKeys[0];
    const chapter = updated.chapters?.find((item) => item.key === newestKey);
    await notifyNewChaptersAvailable(updated.title, chapter?.title ?? newestKey);
  }

  await updateLibraryEntryMetadata(entry.sourceId, entry.mangaKey, {
    title: updated.title,
    cover: updated.cover,
    unreadCount: countUnreadChapters(updated, readChapterKeys),
    downloadedCount: downloads.filter((item) => item.status === 'completed').length,
    lastRefreshed: Date.now(),
    status: updated.status,
    knownChapterKeys: chapterKeys,
    updateFailed: false,
  });
}

export async function refreshLibraryEntries(
  installed: InstalledSource[],
  categoryId?: string,
): Promise<{ refreshed: number; skipped: number; failed: number }> {
  const settings = await getLibraryUpdateSettings();
  if (settings.updateOnWifiOnly) {
    // Wi-Fi detection is not wired yet; proceed for now so refresh still works.
  }

  const entries = await getLibraryEntries(categoryId);
  const runnerCache = new Map<string, SourceRunner>();
  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of entries) {
    if (!(await shouldRefreshLibraryEntry(entry))) {
      skipped += 1;
      continue;
    }

    try {
      await refreshEntry(entry, installed, runnerCache, settings.refreshMetadata);
      refreshed += 1;
    } catch {
      failed += 1;
      await updateLibraryEntryMetadata(entry.sourceId, entry.mangaKey, { updateFailed: true });
    }
  }

  return { refreshed, skipped, failed };
}
