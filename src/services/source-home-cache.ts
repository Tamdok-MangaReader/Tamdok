import * as FileSystem from 'expo-file-system/legacy';

import type { HomeLayout, Listing } from '@/parsers/shared/types';

export type SourceHomeCacheEntry = {
  home: HomeLayout;
  listings: Listing[];
  cachedAt: number;
};

const CACHE_DIR = `${FileSystem.documentDirectory}source-home-cache/`;
const memoryCache = new Map<string, SourceHomeCacheEntry>();

function cacheFilePath(sourceId: string): string {
  const safeId = sourceId.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `${CACHE_DIR}${safeId}.json`;
}

async function ensureCacheDirectory(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

export function peekSourceHomeCache(sourceId: string): SourceHomeCacheEntry | null {
  return memoryCache.get(sourceId) ?? null;
}

export async function readSourceHomeCache(sourceId: string): Promise<SourceHomeCacheEntry | null> {
  const memory = memoryCache.get(sourceId);
  if (memory) return memory;

  await ensureCacheDirectory();
  const path = cacheFilePath(sourceId);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;

  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path)) as SourceHomeCacheEntry;
    if (!parsed?.home || !Array.isArray(parsed.listings)) return null;
    memoryCache.set(sourceId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function writeSourceHomeCache(sourceId: string, entry: SourceHomeCacheEntry): Promise<void> {
  memoryCache.set(sourceId, entry);
  await ensureCacheDirectory();
  await FileSystem.writeAsStringAsync(cacheFilePath(sourceId), JSON.stringify(entry));
}

export async function clearSourceHomeCache(sourceId?: string): Promise<void> {
  if (sourceId) {
    memoryCache.delete(sourceId);
    await ensureCacheDirectory();
    await FileSystem.deleteAsync(cacheFilePath(sourceId), { idempotent: true });
    return;
  }

  memoryCache.clear();
  await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
}
