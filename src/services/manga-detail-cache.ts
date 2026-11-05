import { getCacheDb } from '@/db/cache-database';
import type { Manga } from '@/parsers/shared/types';
import { normalizeManga } from '@/parsers/shared/normalize-manga';
import { LruMap } from '@/utils/lru-map';

export type MangaDetailCacheEntry = {
  manga: Manga;
  cachedAt: number;
};

const memoryCache = new LruMap<MangaDetailCacheEntry>(40);

function normalizeMangaKey(mangaKey: string): string {
  try {
    return decodeURIComponent(mangaKey);
  } catch {
    return mangaKey;
  }
}

function cacheKey(sourceId: string, mangaKey: string): string {
  return `${sourceId}:${normalizeMangaKey(mangaKey)}`;
}

function withNormalizedManga(entry: MangaDetailCacheEntry): MangaDetailCacheEntry {
  return { ...entry, manga: normalizeManga(entry.manga) };
}

export function peekMangaDetailCache(sourceId: string, mangaKey: string): MangaDetailCacheEntry | null {
  return memoryCache.get(cacheKey(sourceId, mangaKey)) ?? null;
}

export async function readMangaDetailCache(
  sourceId: string,
  mangaKey: string,
): Promise<MangaDetailCacheEntry | null> {
  const key = cacheKey(sourceId, mangaKey);
  const memory = memoryCache.get(key);
  if (memory) return memory;

  try {
    const db = await getCacheDb();
    const row = await db.getFirstAsync<{ data: string }>(
      'SELECT data FROM manga_detail WHERE source_id = ? AND manga_key = ?',
      [sourceId, normalizeMangaKey(mangaKey)],
    );
    if (!row) return null;
    const parsed = JSON.parse(row.data) as MangaDetailCacheEntry;
    if (!parsed?.manga?.key) return null;
    const normalized = withNormalizedManga(parsed);
    memoryCache.set(key, normalized);
    return normalized;
  } catch {
    return null;
  }
}

export async function readMangaDetailsMap(
  sourceId: string,
  mangaKeys: string[],
): Promise<Map<string, Manga>> {
  const unique = [...new Set(mangaKeys.filter(Boolean))];
  const result = new Map<string, Manga>();
  await Promise.all(
    unique.map(async (mangaKey) => {
      const entry = await readMangaDetailCache(sourceId, mangaKey);
      if (entry?.manga) result.set(mangaKey, entry.manga);
    }),
  );
  return result;
}

export async function writeMangaDetailCache(
  sourceId: string,
  mangaKey: string,
  entry: MangaDetailCacheEntry,
): Promise<void> {
  const key = cacheKey(sourceId, mangaKey);
  const normalized = withNormalizedManga(entry);
  memoryCache.set(key, normalized);
  const db = await getCacheDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO manga_detail (source_id, manga_key, title, cover, url, data, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      sourceId,
      normalizeMangaKey(mangaKey),
      normalized.manga.title ?? '',
      normalized.manga.cover ?? null,
      normalized.manga.url ?? null,
      JSON.stringify(normalized),
      normalized.cachedAt,
    ],
  );
}

export async function clearMangaDetailCache(sourceId?: string, mangaKey?: string): Promise<void> {
  const db = await getCacheDb();
  if (sourceId && mangaKey) {
    memoryCache.delete(cacheKey(sourceId, mangaKey));
    await db.runAsync('DELETE FROM manga_detail WHERE source_id = ? AND manga_key = ?', [
      sourceId,
      normalizeMangaKey(mangaKey),
    ]);
    return;
  }

  memoryCache.clear();
  await db.runAsync('DELETE FROM manga_detail');
}

export async function clearMangaDetailCacheForSource(sourceId: string): Promise<void> {
  memoryCache.deleteWhere((key) => key.startsWith(`${sourceId}:`));
  const db = await getCacheDb();
  await db.runAsync('DELETE FROM manga_detail WHERE source_id = ?', [sourceId]);
}
