import * as FileSystem from "expo-file-system/legacy";

import type { InstalledSource, Manga } from "@/parsers/shared/types";

const CACHE_DIR = `${FileSystem.documentDirectory}manga-detail-cache/`;
const READ_CONCURRENCY = 8;

export type IllustrationCacheItem = {
  key: string;
  title: string;
  cover?: string;
  url?: string;
  sourceId: string;
  sourceRoute: string;
};

type SourceMatcher = {
  prefix: string;
  source: InstalledSource;
};

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export type IllustrationCacheIndex = {
  files: Array<{ name: string; source: InstalledSource }>;
};

export async function buildIllustrationCacheIndex(
  sources: InstalledSource[],
): Promise<IllustrationCacheIndex> {
  const allowed: SourceMatcher[] = [];
  for (const source of sources) {
    if ((source.manifest.info.contentRating ?? 0) >= 3) continue;
    allowed.push({ prefix: sanitize(`${source.id}:`), source });
  }
  allowed.sort((a, b) => b.prefix.length - a.prefix.length);

  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) return { files: [] };

  const names = await FileSystem.readDirectoryAsync(CACHE_DIR);
  const files: IllustrationCacheIndex["files"] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    for (const matcher of allowed) {
      if (name.startsWith(matcher.prefix)) {
        files.push({ name, source: matcher.source });
        break;
      }
    }
  }
  return { files };
}

async function readItem(
  entry: IllustrationCacheIndex["files"][number],
  routeOf: (source: InstalledSource) => string,
): Promise<IllustrationCacheItem | null> {
  try {
    const raw = await FileSystem.readAsStringAsync(`${CACHE_DIR}${entry.name}`);
    const parsed = JSON.parse(raw) as { manga?: Manga };
    const manga = parsed?.manga;
    if (!manga?.key || !manga.title) return null;
    return {
      key: manga.key,
      title: manga.title,
      cover: manga.cover,
      url: manga.url,
      sourceId: entry.source.id,
      sourceRoute: routeOf(entry.source),
    };
  } catch {
    return null;
  }
}

export async function readIllustrationChunk(
  index: IllustrationCacheIndex,
  from: number,
  count: number,
  routeOf: (source: InstalledSource) => string,
): Promise<IllustrationCacheItem[]> {
  const slice = index.files.slice(from, from + count);
  const result: Array<IllustrationCacheItem | null> = new Array(slice.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < slice.length) {
      const current = cursor;
      cursor += 1;
      result[current] = await readItem(slice[current]!, routeOf);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(READ_CONCURRENCY, slice.length) }, worker),
  );

  return result.filter((item): item is IllustrationCacheItem => item !== null);
}
