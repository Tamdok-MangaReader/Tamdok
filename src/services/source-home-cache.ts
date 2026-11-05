import { getCacheDb } from '@/db/cache-database';
import type { HomeLayout, Listing } from '@/parsers/shared/types';

export type SourceHomeCacheEntry = {
  home: HomeLayout;
  listings: Listing[];
  cachedAt: number;
};

const memoryCache = new Map<string, SourceHomeCacheEntry>();

export function peekSourceHomeCache(sourceId: string): SourceHomeCacheEntry | null {
  return memoryCache.get(sourceId) ?? null;
}

export async function readSourceHomeCache(sourceId: string): Promise<SourceHomeCacheEntry | null> {
  const memory = memoryCache.get(sourceId);
  if (memory) return memory;

  try {
    const db = await getCacheDb();
    const row = await db.getFirstAsync<{ data: string }>(
      'SELECT data FROM source_home WHERE source_id = ?',
      [sourceId],
    );
    if (!row) return null;
    const parsed = JSON.parse(row.data) as SourceHomeCacheEntry;
    if (!parsed?.home || !Array.isArray(parsed.listings)) return null;
    memoryCache.set(sourceId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function writeSourceHomeCache(sourceId: string, entry: SourceHomeCacheEntry): Promise<void> {
  memoryCache.set(sourceId, entry);
  const db = await getCacheDb();
  await db.runAsync('INSERT OR REPLACE INTO source_home (source_id, data, cached_at) VALUES (?, ?, ?)', [
    sourceId,
    JSON.stringify(entry),
    entry.cachedAt,
  ]);
}

export async function clearSourceHomeCache(sourceId?: string): Promise<void> {
  const db = await getCacheDb();
  if (sourceId) {
    memoryCache.delete(sourceId);
    await db.runAsync('DELETE FROM source_home WHERE source_id = ?', [sourceId]);
    return;
  }

  memoryCache.clear();
  await db.runAsync('DELETE FROM source_home');
}
