import * as FileSystem from "expo-file-system/legacy";
import * as SQLite from "expo-sqlite";

/**
 * Separate database for regenerable caches (manga pages, source home screens). It is kept apart from
 * tamdok.db so large cache writes never compete with user data and it is never part of a backup.
 * If the file is ever damaged it is simply deleted and rebuilt.
 */

export type CacheDb = SQLite.SQLiteDatabase;

export const CACHE_DB_NAME = "cache.db";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS manga_detail (
     source_id TEXT NOT NULL,
     manga_key TEXT NOT NULL,
     title TEXT NOT NULL DEFAULT '',
     cover TEXT,
     url TEXT,
     data TEXT NOT NULL,
     cached_at INTEGER NOT NULL,
     PRIMARY KEY (source_id, manga_key)
   ) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS source_home (
     source_id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     cached_at INTEGER NOT NULL
   ) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS registry_cache (
     url TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     cached_at INTEGER NOT NULL
   ) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS cache_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID`,
];

let dbPromise: Promise<CacheDb> | null = null;

async function open(): Promise<CacheDb> {
  const db = await SQLite.openDatabaseAsync(CACHE_DB_NAME);
  // Caches can always be rebuilt, so durability is traded for write speed.
  await db.execAsync(
    "PRAGMA journal_mode = WAL; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY;",
  );
  for (const statement of SCHEMA) await db.execAsync(statement);
  return db;
}

async function openWithRecovery(): Promise<CacheDb> {
  try {
    return await open();
  } catch {
    await SQLite.deleteDatabaseAsync(CACHE_DB_NAME).catch(() => undefined);
    return open();
  }
}

/** The shared cache connection; opened on first use, importing the old per-file caches once. */
export function getCacheDb(): Promise<CacheDb> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openWithRecovery();
      const { migrateLegacyCacheFiles } = await import("@/db/legacy-cache-import");
      await migrateLegacyCacheFiles(db).catch(() => undefined);
      return db;
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/** Size of the cache database files (main + write-ahead log). */
export async function cacheDatabaseSize(): Promise<number> {
  const directory = SQLite.defaultDatabaseDirectory.replace(/\/+$/, "");
  const base = directory.startsWith("file://") ? directory : `file://${directory}`;
  let total = 0;
  for (const suffix of ["", "-wal"]) {
    const info = await FileSystem.getInfoAsync(`${base}/${CACHE_DB_NAME}${suffix}`).catch(
      () => null,
    );
    if (info && info.exists && "size" in info) total += info.size;
  }
  return total;
}

export async function cacheRowCount(table: "manga_detail" | "source_home" | "registry_cache"): Promise<number> {
  const db = await getCacheDb();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return row?.n ?? 0;
}

// DELETE does not shrink the file; compact it after the cache was wiped.
export async function compactCacheDatabase(): Promise<void> {
  const db = await getCacheDb();
  await db.execAsync("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
}
