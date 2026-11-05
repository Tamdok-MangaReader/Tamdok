import * as FileSystem from "expo-file-system/legacy";

import { insertMany, type Db } from "@/db/database";
import { REFRESH_LAST_READ_SQL, bulkRefreshStatements } from "@/db/schema";

/**
 * Converts the documents of the pre-SQLite storage (and of JSON backups) into table rows.
 * The same importers serve the one-time migration of app-preferences.json and the restore of old
 * `.json` backups.
 */

export const LIBRARY_SETTINGS_KEY = "library_settings_v2";
const LEGACY_DONE_KEY = "legacy_json_migrated_v1";
const PREFS_PATH = `${FileSystem.documentDirectory}app-preferences.json`;
const TMP_PATH = `${FileSystem.documentDirectory}app-preferences.json.tmp`;

// Keys of the old single-file store that now live in tables.
const LIBRARY_KEY = "library_v1";
const TRACKING_KEY = "manga_tracking_v1";
const DOWNLOADS_KEY = "downloads_v1";

type Loose = Record<string, unknown>;
type Runner = <T>(task: (tx: Db) => Promise<T>) => Promise<T>;

function asRecord(value: unknown): Loose {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Loose)
    : {};
}

function asArray(value: unknown): Loose[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export const LIBRARY_CATEGORY_DOC_KEYS = [
  "categories",
  "defaultCategoryId",
  "excludedCategoryIds",
] as const;

export const LIBRARY_SETTING_DOC_KEYS = [
  "currentCategoryId",
  "updateOnWifiOnly",
  "updateInterval",
  "skipUnreadChapters",
  "skipCompletedStatus",
  "skipUnreadManga",
  "refreshMetadata",
  "backgroundRefresh",
  "lastAutoRefreshAt",
] as const;

/**
 * Imports a library document ({ entries, categories, ...settings }). Only the parts that are present
 * are replaced, which is how partial backups restore.
 */
export async function importLibraryDocument(tx: Db, doc: unknown): Promise<void> {
  const library = asRecord(doc);

  if ("categories" in library) {
    await tx.runAsync("DELETE FROM categories");
    const rows = asArray(library.categories).map((category, index) => [
      str(category.id),
      str(category.name),
      num(category.sortOrder, index),
    ]);
    await insertMany(
      tx,
      "INSERT OR REPLACE INTO categories (id, name, sort_order)",
      3,
      rows.filter((row) => row[0] !== ""),
    );
  }

  const settingKeys = [
    ...LIBRARY_SETTING_DOC_KEYS,
    "defaultCategoryId",
    "excludedCategoryIds",
  ] as const;
  const patch: Loose = {};
  for (const key of settingKeys) if (key in library) patch[key] = library[key];
  if (Object.keys(patch).length > 0) {
    const existing = await tx.getFirstAsync<{ value: string }>(
      "SELECT value FROM kv WHERE key = ?",
      [LIBRARY_SETTINGS_KEY],
    );
    let current: Loose = {};
    try {
      current = asRecord(existing ? JSON.parse(existing.value) : {});
    } catch {}
    await tx.runAsync(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      [LIBRARY_SETTINGS_KEY, JSON.stringify({ ...current, ...patch })],
    );
  }

  if ("entries" in library) {
    await tx.runAsync("DELETE FROM library_entries");
    await tx.runAsync("DELETE FROM library_entry_categories");
    await tx.runAsync("DELETE FROM known_chapters");

    const entryRows: Array<Array<string | number | null>> = [];
    const categoryRows: Array<Array<string | number | null>> = [];
    const chapterRows: Array<Array<string | number | null>> = [];
    const seen = new Set<string>();

    for (const entry of asArray(library.entries)) {
      const sourceId = str(entry.sourceId);
      const mangaKey = str(entry.mangaKey);
      if (!sourceId || !mangaKey) continue;
      const identity = `${sourceId}\u0000${mangaKey}`;
      if (seen.has(identity)) continue;
      seen.add(identity);

      const keys = Array.isArray(entry.knownChapterKeys)
        ? [...new Set(entry.knownChapterKeys.filter((k) => typeof k === "string"))]
        : [];
      entryRows.push([
        sourceId,
        mangaKey,
        str(entry.title, mangaKey),
        optStr(entry.cover),
        num(entry.dateAdded, Date.now()),
        optNum(entry.unreadCount),
        optNum(entry.downloadedCount),
        optNum(entry.lastRefreshed),
        optStr(entry.status),
        entry.updateFailed ? 1 : 0,
        optNum(entry.lastAttemptAt),
        entry.favorite ? 1 : 0,
        keys.length,
      ]);
      for (const categoryId of Array.isArray(entry.categoryIds)
        ? [...new Set(entry.categoryIds)]
        : []) {
        if (typeof categoryId === "string" && categoryId !== "all") {
          categoryRows.push([sourceId, mangaKey, categoryId]);
        }
      }
      (keys as string[]).forEach((key, position) =>
        chapterRows.push([sourceId, mangaKey, key, position]),
      );
    }

    await insertMany(
      tx,
      `INSERT OR REPLACE INTO library_entries (source_id, manga_key, title, cover, date_added,
        unread_count, downloaded_count, last_refreshed, status, update_failed, last_attempt_at,
        favorite, chapter_count)`,
      13,
      entryRows,
    );
    await insertMany(
      tx,
      "INSERT OR REPLACE INTO library_entry_categories (source_id, manga_key, category_id)",
      3,
      categoryRows,
    );
    await insertMany(
      tx,
      "INSERT OR REPLACE INTO known_chapters (source_id, manga_key, chapter_key, position)",
      4,
      chapterRows,
    );
  }
}

/**
 * Imports a tracking document ({ chapters, history }). Both parts present: replaces the whole reading
 * log. One part present: only that part is replaced and the other is kept.
 */
export async function importTrackingDocument(tx: Db, doc: unknown): Promise<void> {
  const tracking = asRecord(doc);
  const hasChapters = "chapters" in tracking;
  const hasHistory = "history" in tracking;
  if (!hasChapters && !hasHistory) return;

  if (hasChapters && hasHistory) {
    await tx.runAsync("DELETE FROM reading_log");
  } else if (hasChapters) {
    await tx.runAsync("DELETE FROM reading_log WHERE history_at IS NULL");
  } else {
    await tx.runAsync("UPDATE reading_log SET history_at = NULL, chapter_title = NULL");
  }

  type Row = {
    sourceId: string;
    mangaKey: string;
    chapterKey: string;
    page: number;
    dateRead: number;
    historyAt: number | null;
    chapterTitle: string | null;
  };
  const rows = new Map<string, Row>();
  const identity = (s: string, m: string, c: string) => `${s}\u0000${m}\u0000${c}`;

  if (hasChapters) {
    for (const progress of Object.values(asRecord(tracking.chapters))) {
      const item = asRecord(progress);
      const sourceId = str(item.sourceId);
      const mangaKey = str(item.mangaKey);
      const chapterKey = str(item.chapterKey);
      if (!sourceId || !mangaKey || !chapterKey) continue;
      rows.set(identity(sourceId, mangaKey, chapterKey), {
        sourceId,
        mangaKey,
        chapterKey,
        page: num(item.page, 0),
        dateRead: num(item.dateRead, 0),
        historyAt: null,
        chapterTitle: null,
      });
    }
  }

  const meta = new Map<string, { title: string; cover: string | null }>();
  if (hasHistory) {
    // History is newest first, so the first line of a manga carries its latest title.
    for (const entry of asArray(tracking.history)) {
      const sourceId = str(entry.sourceId);
      const mangaKey = str(entry.mangaKey);
      const chapterKey = str(entry.chapterKey);
      if (!sourceId || !mangaKey || !chapterKey) continue;
      const key = identity(sourceId, mangaKey, chapterKey);
      const dateRead = num(entry.dateRead, 0);
      const existing = rows.get(key);
      if (existing) {
        existing.historyAt = dateRead;
        existing.chapterTitle = optStr(entry.chapterTitle);
      } else {
        rows.set(key, {
          sourceId,
          mangaKey,
          chapterKey,
          page: num(entry.page, 0),
          dateRead,
          historyAt: dateRead,
          chapterTitle: optStr(entry.chapterTitle),
        });
      }
      const mangaId = `${sourceId}\u0000${mangaKey}`;
      const current = meta.get(mangaId);
      const title = str(entry.mangaTitle);
      const cover = optStr(entry.cover);
      if (!current) {
        meta.set(mangaId, { title: title || mangaKey, cover });
      } else if (!current.cover && cover) {
        current.cover = cover;
      }
    }
  }

  await insertMany(
    tx,
    `INSERT INTO reading_log (source_id, manga_key, chapter_key, page, date_read, history_at, chapter_title)`,
    7,
    [...rows.values()].map((row) => [
      row.sourceId,
      row.mangaKey,
      row.chapterKey,
      row.page,
      row.dateRead,
      row.historyAt,
      row.chapterTitle,
    ]),
    `ON CONFLICT (source_id, manga_key, chapter_key) DO UPDATE SET
       page = excluded.page,
       date_read = excluded.date_read,
       history_at = COALESCE(excluded.history_at, reading_log.history_at),
       chapter_title = COALESCE(excluded.chapter_title, reading_log.chapter_title)`,
  );
  await insertMany(
    tx,
    "INSERT OR REPLACE INTO manga_meta (source_id, manga_key, title, cover)",
    4,
    [...meta.entries()].map(([id, value]) => {
      const [sourceId, mangaKey] = id.split("\u0000") as [string, string];
      return [sourceId, mangaKey, value.title, value.cover];
    }),
  );
}

export async function importDownloadsDocument(tx: Db, doc: unknown): Promise<void> {
  await tx.runAsync("DELETE FROM downloads");
  const seen = new Set<string>();
  const rows: Array<Array<string | number | null>> = [];
  for (const entry of asArray(asRecord(doc).entries)) {
    const sourceId = str(entry.sourceId);
    const mangaKey = str(entry.mangaKey);
    const chapterKey = str(entry.chapterKey);
    if (!sourceId || !mangaKey || !chapterKey) continue;
    const identity = `${sourceId}\u0000${mangaKey}\u0000${chapterKey}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    rows.push([
      sourceId,
      mangaKey,
      chapterKey,
      str(entry.mangaTitle, mangaKey),
      optStr(entry.chapterTitle),
      str(entry.status, "pending"),
      num(entry.progress, 0),
      num(entry.dateAdded, Date.now()),
      optStr(entry.error),
    ]);
  }
  await insertMany(
    tx,
    `INSERT OR REPLACE INTO downloads (source_id, manga_key, chapter_key, manga_title,
      chapter_title, status, progress, date_added, error)`,
    9,
    rows,
  );
}

/** Writes preference-style keys; the three big documents are routed to their tables. */
export async function importPreferenceMap(
  tx: Db,
  preferences: Record<string, unknown>,
): Promise<void> {
  const rows: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(preferences)) {
    if (key === LIBRARY_KEY) await importLibraryDocument(tx, value);
    else if (key === TRACKING_KEY) await importTrackingDocument(tx, value);
    else if (key === DOWNLOADS_KEY) await importDownloadsDocument(tx, value);
    else {
      const serialized = JSON.stringify(value);
      if (serialized !== undefined) rows.push([key, serialized]);
    }
  }
  await insertMany(tx, "INSERT OR REPLACE INTO kv (key, value)", 2, rows);
}

type FileRead =
  | { state: "missing" }
  | { state: "unreadable" }
  | { state: "ok"; data: Loose };

async function readJsonFile(path: string): Promise<FileRead> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return { state: "missing" };
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { state: "ok", data: parsed as Loose }
      : { state: "unreadable" };
  } catch {
    return { state: "unreadable" };
  }
}

async function markMigrated(tx: Db): Promise<void> {
  await tx.runAsync("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
    LEGACY_DONE_KEY,
    JSON.stringify(Date.now()),
  ]);
}

async function alreadyMigrated(db: Db): Promise<boolean> {
  const done = await db.getFirstAsync("SELECT 1 FROM kv WHERE key = ?", [
    LEGACY_DONE_KEY,
  ]);
  return done != null;
}

/**
 * One-time import of app-preferences.json (the pre-SQLite storage) into SQLite, so an update changes
 * nothing for the user. Properties:
 * - all-or-nothing: the whole import is one transaction; if it fails, each top-level key is imported on
 *   its own so one bad document cannot hide the rest, and the marker is only written when everything
 *   went through (otherwise the next launch retries);
 * - safe when two JS contexts start at once (app and background task): the marker is re-checked inside
 *   the transaction;
 * - the old file is never deleted: it is renamed to app-preferences.json.migrated.
 */
export async function migrateLegacyStorage(db: Db, run: Runner): Promise<void> {
  if (await alreadyMigrated(db)) return;

  const [main, backup] = await Promise.all([
    readJsonFile(PREFS_PATH),
    readJsonFile(TMP_PATH),
  ]);
  const source = main.state === "ok" ? main : backup.state === "ok" ? backup : null;

  if (!source) {
    // A file that exists but cannot be parsed must not be marked as migrated; try again next launch.
    if (main.state === "unreadable" || backup.state === "unreadable") return;
    await run(markMigrated);
    return;
  }

  let complete = true;
  try {
    await run(async (tx) => {
      const done = await tx.getFirstAsync("SELECT 1 FROM kv WHERE key = ?", [LEGACY_DONE_KEY]);
      if (done) {
        complete = false;
        return;
      }
      await importPreferenceMap(tx, source.data);
      await tx.runAsync(REFRESH_LAST_READ_SQL);
      for (const statement of bulkRefreshStatements(false)) await tx.runAsync(statement);
      await markMigrated(tx);
    });
  } catch {
    let failed = false;
    for (const [key, value] of Object.entries(source.data)) {
      try {
        await run((tx) => importPreferenceMap(tx, { [key]: value }));
      } catch {
        failed = true;
      }
    }
    await run(async (tx) => {
      await tx.runAsync(REFRESH_LAST_READ_SQL);
      for (const statement of bulkRefreshStatements(false)) await tx.runAsync(statement);
    }).catch(() => undefined);
    if (failed) return;
    await run(markMigrated);
  }

  if (!complete) return;
  // Keep the old file as a safety copy; failing to rename it only means it stays where it is.
  for (const path of [PREFS_PATH, TMP_PATH]) {
    try {
      const target = `${path}.migrated`;
      await FileSystem.deleteAsync(target, { idempotent: true });
      await FileSystem.moveAsync({ from: path, to: target });
    } catch {}
  }
}
