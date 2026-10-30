import { filterRenderablePages } from '@/utils/reader-pages';
import { processDownloadQueue } from '@/services/downloads';
import { readMangaDetailCache } from '@/services/manga-detail-cache';
import { getEffectiveSourceSettings } from '@/services/source-settings';
import { findInstalledSource, getOrCreateSourceRunner } from '@/services/sources';
import { resolveLibgroupCoverHeaders } from '@/utils/libgroup-image-headers';
import type { Chapter, InstalledSource, Manga } from '@/parsers/shared/types';

export async function processQueuedDownloads(installed: InstalledSource[]): Promise<void> {
  await processDownloadQueue(async (sourceId, mangaKey, chapterKey, mangaTitle, chapterTitle) => {
    const source = findInstalledSource(installed, sourceId);
    if (!source) throw new Error('Source not installed');

    const [runner, settings, cached] = await Promise.all([
      getOrCreateSourceRunner(source),
      getEffectiveSourceSettings(source),
      readMangaDetailCache(source.id, mangaKey).catch(() => null),
    ]);
    const headers = resolveLibgroupCoverHeaders(source, settings);

    const cachedManga = cached?.manga;
    const manga: Manga = cachedManga ?? { key: mangaKey, title: mangaTitle };
    const chapter: Chapter = cachedManga?.chapters?.find((item) => item.key === chapterKey) ?? {
      key: chapterKey,
      title: chapterTitle,
    };

    const pages = filterRenderablePages(await runner.getPageList(manga, chapter)).filter((page) =>
      Boolean(page.url),
    );
    return {
      urls: pages.map((page) => page.url as string),
      headers,
      pageHeaders: pages.map((page) => page.headers),
    };
  });
}
