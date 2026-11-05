import * as FileSystem from "expo-file-system/legacy";
import * as SQLite from "expo-sqlite";

import { MIGRATIONS } from "@/db/schema";

export type Db = SQLite.SQLiteDatabase;

export const DB_NAME = "tamdok.db";

let dbPromise: Promise<Db> | null = null;
let writeTail: Promise<unknown> = Promise.resolve();

/** Plain filesystem path (no file:// scheme), as SQLite's ATTACH and VACUUM INTO expect it. */
export function toDbPath(uri: string): string {
  return uri.startsWith("file://") ? decodeURI(uri.slice("file://".length)) : uri;
}

/** Path of the main database file. */
export function mainDatabasePath(): string {
  const directory = SQLite.defaultDatabaseDirectory.replace(/\/+$/, "");
  return `${toDbPath(directory)}/${DB_NAME}`;
}

export async function mainDatabaseSize(): Promise<number> {
  const info = await FileSystem.getInfoAsync(`file://${mainDatabasePath()}`).catch(
    () => null,
  );
  return info && info.exists && "size" in info ? info.size : 0;
}

async function runExclusive<T>(
  db: Db,
  task: (tx: Db) => Promise<T>,
): Promise<T> {
  let result!: T;
  await db.withExclusiveTransactionAsync(async (tx) => {
    result = await task(tx as Db);
  });
  return result;
}

async function migrate(db: Db): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const statements = MIGRATIONS[version]!();
    await runExclusive(db, async (tx) => {
      for (const statement of statements) await tx.execAsync(statement);
      // PRAGMA values cannot be bound; the version is a trusted integer.
      await tx.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

async function openAndPrepare(): Promise<Db> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(
    "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;",
  );
  await migrate(db);
  // Imports the pre-SQLite app-preferences.json once. It runs before anything else can use the database,
  // and leaves the old file untouched when it fails so the next launch can try again.
  const { migrateLegacyStorage } = await import("@/db/legacy-import");
  await migrateLegacyStorage(db, (task) => runExclusive(db, task));
  return db;
}

/** The shared database connection; opened, migrated and filled from the legacy file on first use. */
export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = openAndPrepare().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/**
 * Runs `task` inside one exclusive transaction. Writes are serialised through a queue, so tasks never
 * interleave; readers on the main connection keep working (WAL). A thrown error rolls everything back.
 */
export function runWrite<T>(task: (tx: Db) => Promise<T>): Promise<T> {
  const run = writeTail.then(async () => runExclusive(await getDb(), task));
  writeTail = run.catch(() => undefined);
  return run;
}

/** Resolves when every write queued so far has finished. */
export async function flushWrites(): Promise<void> {
  await writeTail;
}

type SqlValue = string | number | null;

/** SQLite caps bound variables per statement; stay well below the oldest limit (999). */
const MAX_VARIABLES = 900;

/**
 * Bulk insert with multi-row VALUES. `head` is everything before VALUES, e.g.
 * "INSERT OR REPLACE INTO kv (key, value)"; `tail` may add an ON CONFLICT clause.
 */
export async function insertMany(
  tx: Db,
  head: string,
  columns: number,
  rows: ReadonlyArray<ReadonlyArray<SqlValue>>,
  tail = "",
): Promise<void> {
  if (rows.length === 0) return;
  const perStatement = Math.max(1, Math.floor(MAX_VARIABLES / columns));
  const group = `(${placeholders(columns)})`;
  let full: Awaited<ReturnType<Db["prepareAsync"]>> | null = null;
  try {
    for (let start = 0; start < rows.length; start += perStatement) {
      const chunk = rows.slice(start, start + perStatement);
      const values: SqlValue[] = [];
      for (const row of chunk) values.push(...row);
      if (chunk.length === perStatement) {
        full ??= await tx.prepareAsync(
          `${head} VALUES ${Array.from({ length: perStatement }, () => group).join(", ")} ${tail}`,
        );
        await full.executeAsync(values);
      } else {
        await tx.runAsync(
          `${head} VALUES ${chunk.map(() => group).join(", ")} ${tail}`,
          values,
        );
      }
    }
  } finally {
    await full?.finalizeAsync();
  }
}

/** "?, ?, ?" placeholder list for `count` values. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

/** Row count of a data table (for the storage statistics). */
export async function countRows(table: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${table}`,
  );
  return row?.n ?? 0;
}

/** Size of the SQLite write-ahead log next to the main file (0 when it does not exist). */
export async function walDatabaseSize(): Promise<number> {
  const info = await FileSystem.getInfoAsync(
    `file://${mainDatabasePath()}-wal`,
  ).catch(() => null);
  return info && info.exists && "size" in info ? info.size : 0;
}

/**
 * Runs `task` on a dedicated connection to the main database with another database file attached as
 * `bk`, inside one write transaction. The shared write queue is held for the duration, so no other write
 * interleaves; readers keep working (WAL). Any error rolls the whole transaction back.
 * ATTACH cannot run inside a transaction, which is why this does not go through `runWrite`.
 */
export function runWithAttached<T>(
  attachPath: string,
  task: (conn: Db) => Promise<T>,
): Promise<T> {
  const run = writeTail.then(async () => {
    await getDb();
    const conn = await SQLite.openDatabaseAsync(DB_NAME);
    try {
      await conn.execAsync("PRAGMA busy_timeout = 15000");
      await conn.runAsync("ATTACH DATABASE ? AS bk", [attachPath]);
      await conn.execAsync("BEGIN IMMEDIATE");
      let result: T;
      try {
        result = await task(conn);
        await conn.execAsync("COMMIT");
      } catch (error) {
        await conn.execAsync("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await conn.execAsync("DETACH DATABASE bk").catch(() => undefined);
      }
      return result;
    } finally {
      await conn.closeAsync().catch(() => undefined);
    }
  });
  writeTail = run.catch(() => undefined);
  return run;
}
