import * as FileSystem from 'expo-file-system/legacy';

import type { Manga } from '@/parsers/shared/types';

export type MangaDetailCacheEntry = {
  manga: Manga;
  cachedAt: number;
};

const CACHE_DIR = `${FileSystem.documentDirectory}manga-detail-cache/`;
const memoryCache = new Map<string, MangaDetailCacheEntry>();

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

function cacheFilePath(sourceId: string, mangaKey: string): string {
  const safeKey = cacheKey(sourceId, mangaKey).replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `${CACHE_DIR}${safeKey}.json`;
}

async function ensureCacheDirectory(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
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

  await ensureCacheDirectory();
  const path = cacheFilePath(sourceId, mangaKey);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;

  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path)) as MangaDetailCacheEntry;
    if (!parsed?.manga?.key) return null;
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function writeMangaDetailCache(
  sourceId: string,
  mangaKey: string,
  entry: MangaDetailCacheEntry,
): Promise<void> {
  const key = cacheKey(sourceId, mangaKey);
  memoryCache.set(key, entry);
  await ensureCacheDirectory();
  await FileSystem.writeAsStringAsync(cacheFilePath(sourceId, mangaKey), JSON.stringify(entry));
}

export async function clearMangaDetailCache(sourceId?: string, mangaKey?: string): Promise<void> {
  if (sourceId && mangaKey) {
    memoryCache.delete(cacheKey(sourceId, mangaKey));
    await ensureCacheDirectory();
    await FileSystem.deleteAsync(cacheFilePath(sourceId, mangaKey), { idempotent: true });
    return;
  }

  memoryCache.clear();
  await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
}
