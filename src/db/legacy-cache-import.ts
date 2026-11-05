import * as FileSystem from "expo-file-system/legacy";

import type { CacheDb } from "@/db/cache-database";
import { insertMany } from "@/db/database";

/**
 * One-time import of the old per-file caches (manga-detail-cache/, source-home-cache/) into cache.db.
 * File names are sanitised keys, so the source is recovered by matching them against installed sources.
 * The old folders are removed afterwards (everything in them is rebuilt from the network).
 */

const DETAIL_DIR = `${FileSystem.documentDirectory}manga-detail-cache/`;
const HOME_DIR = `${FileSystem.documentDirectory}source-home-cache/`;
const REGISTRY_DIR = `${FileSystem.documentDirectory}registry-cache/`;
const DONE_KEY = "legacy_cache_files_imported_v1";
const READ_CONCURRENCY = 8;

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function listJson(dir: string): Promise<string[]> {
  const info = await FileSystem.getInfoAsync(dir).catch(() => null);
  if (!info || !info.exists) return [];
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
  return names.filter((name) => name.endsWith(".json"));
}

async function readAll<T>(
  dir: string,
  names: string[],
  handle: (name: string, parsed: T) => void,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < names.length) {
      const name = names[cursor++]!;
      try {
        handle(name, JSON.parse(await FileSystem.readAsStringAsync(`${dir}${name}`)) as T);
      } catch {}
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, names.length) }, worker));
}

export async function migrateLegacyCacheFiles(db: CacheDb): Promise<void> {
  const done = await db.getFirstAsync("SELECT 1 FROM cache_meta WHERE key = ?", [DONE_KEY]);
  if (done) return;

  const [detailNames, homeNames, registryNames] = await Promise.all([
    listJson(DETAIL_DIR),
    listJson(HOME_DIR),
    listJson(REGISTRY_DIR),
  ]);
  if (detailNames.length > 0 || homeNames.length > 0 || registryNames.length > 0) {
    const { listInstalledSources } = await import("@/parsers/shared/source-manager");
    const sources = (await listInstalledSources()).map((source) => source.id);
    const prefixes = sources
      .map((id) => ({ id, prefix: sanitize(`${id}:`) }))
      .sort((a, b) => b.prefix.length - a.prefix.length);

    const detailRows: Array<Array<string | number | null>> = [];
    await readAll<{
      manga?: { key?: string; title?: string; cover?: string; url?: string };
      cachedAt?: number;
    }>(DETAIL_DIR, detailNames, (name, parsed) => {
      const manga = parsed?.manga;
      if (!manga?.key) return;
      const source = prefixes.find((candidate) => name.startsWith(candidate.prefix));
      if (!source) return;
      let key = manga.key;
      try {
        key = decodeURIComponent(key);
      } catch {}
      detailRows.push([
        source.id,
        key,
        manga.title ?? "",
        manga.cover ?? null,
        manga.url ?? null,
        JSON.stringify(parsed),
        parsed.cachedAt ?? 0,
      ]);
    });

    const homeRows: Array<Array<string | number | null>> = [];
    await readAll<{ home?: unknown; listings?: unknown; cachedAt?: number }>(
      HOME_DIR,
      homeNames,
      (name, parsed) => {
        if (!parsed?.home || !Array.isArray(parsed.listings)) return;
        const id = sources.find((candidate) => `${sanitize(candidate)}.json` === name);
        if (!id) return;
        homeRows.push([id, JSON.stringify(parsed), parsed.cachedAt ?? 0]);
      },
    );

    // Registry cache file names are slugs of the registry URL, so they are matched against the
    // registries the app knows.
    const registryRows: Array<Array<string | number | null>> = [];
    if (registryNames.length > 0) {
      const { getRegistryUrls } = await import("@/services/sources");
      const known = new Map<string, string>();
      for (const registry of await getRegistryUrls().catch(() => [])) {
        known.set(`${encodeURIComponent(registry.url).replace(/%/g, "_")}.json`, registry.url);
      }
      await readAll<{ data?: unknown; cachedAt?: number }>(REGISTRY_DIR, registryNames, (name, parsed) => {
        const url = known.get(name);
        if (!url || !parsed?.data) return;
        registryRows.push([url, JSON.stringify(parsed.data), parsed.cachedAt ?? 0]);
      });
    }

    await db.withExclusiveTransactionAsync(async (tx) => {
      await insertMany(
        tx as CacheDb,
        "INSERT OR IGNORE INTO registry_cache (url, data, cached_at)",
        3,
        registryRows,
      );
      await insertMany(
        tx as CacheDb,
        "INSERT OR IGNORE INTO manga_detail (source_id, manga_key, title, cover, url, data, cached_at)",
        7,
        detailRows,
      );
      await insertMany(
        tx as CacheDb,
        "INSERT OR IGNORE INTO source_home (source_id, data, cached_at)",
        3,
        homeRows,
      );
    });
  }

  await db.runAsync("INSERT OR REPLACE INTO cache_meta (key, value) VALUES (?, '1')", [DONE_KEY]);
  await FileSystem.deleteAsync(DETAIL_DIR, { idempotent: true }).catch(() => undefined);
  await FileSystem.deleteAsync(HOME_DIR, { idempotent: true }).catch(() => undefined);
  await FileSystem.deleteAsync(REGISTRY_DIR, { idempotent: true }).catch(() => undefined);
}
