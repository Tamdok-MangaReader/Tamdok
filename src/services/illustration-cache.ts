import { getCacheDb } from "@/db/cache-database";
import type { InstalledSource } from "@/parsers/shared/types";

export type IllustrationCacheItem = {
  key: string;
  title: string;
  cover?: string;
  url?: string;
  sourceId: string;
  sourceRoute: string;
};

type IndexRow = {
  source_id: string;
  manga_key: string;
  title: string;
  cover: string | null;
  url: string | null;
};

export type IllustrationCacheIndex = {
  files: Array<{ row: IndexRow; source: InstalledSource }>;
};

// Lists cached manga of sources allowed in illustration mode (content rating below 3). Only the light
// columns are read; the cached documents themselves stay in the database.
export async function buildIllustrationCacheIndex(
  sources: InstalledSource[],
): Promise<IllustrationCacheIndex> {
  const allowed = new Map<string, InstalledSource>();
  for (const source of sources) {
    if ((source.manifest.info.contentRating ?? 0) >= 3) continue;
    allowed.set(source.id, source);
  }
  if (allowed.size === 0) return { files: [] };

  const db = await getCacheDb();
  const rows = await db.getAllAsync<IndexRow>(
    "SELECT source_id, manga_key, title, cover, url FROM manga_detail WHERE title <> ''",
  );
  const files: IllustrationCacheIndex["files"] = [];
  for (const row of rows) {
    const source = allowed.get(row.source_id);
    if (source) files.push({ row, source });
  }
  return { files };
}

export async function readIllustrationChunk(
  index: IllustrationCacheIndex,
  from: number,
  count: number,
  routeOf: (source: InstalledSource) => string,
): Promise<IllustrationCacheItem[]> {
  return index.files.slice(from, from + count).map(({ row, source }) => ({
    key: row.manga_key,
    title: row.title,
    cover: row.cover ?? undefined,
    url: row.url ?? undefined,
    sourceId: source.id,
    sourceRoute: routeOf(source),
  }));
}
