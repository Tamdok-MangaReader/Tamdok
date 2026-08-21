import type { Page } from '@/parsers/shared/types';
import { LruMap } from '@/utils/lru-map';
import { filterRenderablePages } from '@/utils/reader-pages';

type ReaderPageCacheEntry = {
  pages: Page[];
  cachedAt: number;
};

const memoryCache = new LruMap<ReaderPageCacheEntry>(8);

function normalizeKey(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function cacheKey(sourceId: string, mangaKey: string, chapterKey: string): string {
  return `${sourceId}:${normalizeKey(mangaKey)}:${normalizeKey(chapterKey)}`;
}

export function peekReaderPageCache(sourceId: string, mangaKey: string, chapterKey: string): Page[] | null {
  const pages = memoryCache.get(cacheKey(sourceId, mangaKey, chapterKey))?.pages ?? null;
  if (!pages?.length) return null;
  return filterRenderablePages(pages);
}

export function writeReaderPageCache(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
  pages: Page[],
): void {
  const usable = filterRenderablePages(pages);
  if (usable.length === 0) return;
  memoryCache.set(cacheKey(sourceId, mangaKey, chapterKey), {
    pages: usable,
    cachedAt: Date.now(),
  });
}
