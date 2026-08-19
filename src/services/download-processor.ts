import { filterRenderablePages } from '@/utils/reader-pages';
import { processDownloadQueue } from '@/services/downloads';
import { getEffectiveSourceSettings } from '@/services/source-settings';
import { findInstalledSource, getOrCreateSourceRunner } from '@/services/sources';
import { resolveLibgroupCoverHeaders } from '@/utils/libgroup-image-headers';
import type { InstalledSource } from '@/parsers/shared/types';

export async function processQueuedDownloads(installed: InstalledSource[]): Promise<void> {
  await processDownloadQueue(async (sourceId, mangaKey, chapterKey, mangaTitle, chapterTitle) => {
    const source = findInstalledSource(installed, sourceId);
    if (!source) return { urls: [] };

    const [runner, settings] = await Promise.all([
      getOrCreateSourceRunner(source),
      getEffectiveSourceSettings(source),
    ]);
    const headers = resolveLibgroupCoverHeaders(source, settings);
    const pages = filterRenderablePages(
      await runner.getPageList({ key: mangaKey, title: mangaTitle }, { key: chapterKey, title: chapterTitle }),
    );
    return {
      urls: pages.map((page) => page.url).filter((url): url is string => Boolean(url)),
      headers,
    };
  });
}
