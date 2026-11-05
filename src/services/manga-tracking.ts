import { getDb, runWrite, type Db } from "@/db/database";
import { getAppSettings } from "@/services/app-settings";
import { notifyMangaDataChanged } from "@/utils/manga-events";

// Reading progress of one chapter. `page` is the last page index reached; the special value -1 means the
// chapter is completely read.
export type ChapterProgress = {
  sourceId: string;
  mangaKey: string;
  chapterKey: string;
  page: number;
  dateRead: number;
};

// One line of the reading history (the History tab). Title and cover come from the shared manga_meta
// table, so history can be shown without loading the manga again.
export type HistoryEntry = {
  sourceId: string;
  mangaKey: string;
  chapterKey: string;
  mangaTitle: string;
  chapterTitle?: string;
  cover?: string;
  dateRead: number;
  page?: number;
};

type HistoryMeta = Pick<
  HistoryEntry,
  "mangaTitle" | "chapterTitle" | "cover"
> & {
  notify?: boolean;
};

/**
 * Storage: the `reading_log` table holds one row per chapter with progress (page, date_read) and, for
 * chapters that appear in the History tab, history_at (the last time it was read) and chapter_title.
 * Everything is queried and written per row, so cost does not grow with the size of the history.
 */

// Change notifications are debounced so rapid progress writes while reading do not rerender every screen.
const NOTIFY_DELAY_MS = 80;
const LIBRARY_SYNC_DELAY_MS = 150;
const KEY_CHUNK = 150;

let notifyTimer: ReturnType<typeof setTimeout> | null = null;
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleNotify(): void {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    notifyMangaDataChanged();
  }, NOTIFY_DELAY_MS);
}

function mangaHistoryKey(sourceId: string, mangaKey: string): string {
  return `${sourceId}:${mangaKey}`;
}

// Incognito mode: progress and history are not recorded.
async function trackingWritesDisabled(): Promise<boolean> {
  const settings = await getAppSettings();
  return settings.incognitoMode;
}

// After read marks change, the library's unread badge for that manga is refreshed (debounced per manga).
// The library module is imported lazily to avoid a circular import.
function scheduleLibraryUnreadSync(sourceId: string, mangaKey: string) {
  const key = mangaHistoryKey(sourceId, mangaKey);
  const existing = syncTimers.get(key);
  if (existing) clearTimeout(existing);
  syncTimers.set(
    key,
    setTimeout(() => {
      syncTimers.delete(key);
      void import("@/services/library")
        .then((mod) => mod.syncLibraryEntryUnread(sourceId, mangaKey))
        .catch(() => undefined);
    }, LIBRARY_SYNC_DELAY_MS),
  );
}

async function upsertMangaMeta(
  tx: Db,
  sourceId: string,
  mangaKey: string,
  title: string | undefined,
  cover: string | undefined,
): Promise<void> {
  if (!title) return;
  await tx.runAsync(
    `INSERT INTO manga_meta (source_id, manga_key, title, cover) VALUES (?, ?, ?, ?)
     ON CONFLICT (source_id, manga_key) DO UPDATE SET
       title = excluded.title,
       cover = COALESCE(excluded.cover, manga_meta.cover)`,
    [sourceId, mangaKey, title, cover ?? null],
  );
}

type ProgressRow = { chapter_key: string; page: number; date_read: number };

export async function getChapterProgress(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
): Promise<ChapterProgress | undefined> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ page: number; date_read: number }>(
    `SELECT page, date_read FROM reading_log
     WHERE source_id = ? AND manga_key = ? AND chapter_key = ?`,
    [sourceId, mangaKey, chapterKeyValue],
  );
  if (!row) return undefined;
  return {
    sourceId,
    mangaKey,
    chapterKey: chapterKeyValue,
    page: row.page,
    dateRead: row.date_read,
  };
}

export async function isChapterRead(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
): Promise<boolean> {
  const progress = await getChapterProgress(
    sourceId,
    mangaKey,
    chapterKeyValue,
  );
  return progress?.page === -1;
}

export async function getMangaChapterProgress(
  sourceId: string,
  mangaKey: string,
): Promise<Record<string, ChapterProgress>> {
  const db = await getDb();
  const rows = await db.getAllAsync<ProgressRow>(
    `SELECT chapter_key, page, date_read FROM reading_log
     WHERE source_id = ? AND manga_key = ?`,
    [sourceId, mangaKey],
  );
  const result: Record<string, ChapterProgress> = {};
  for (const row of rows) {
    result[row.chapter_key] = {
      sourceId,
      mangaKey,
      chapterKey: row.chapter_key,
      page: row.page,
      dateRead: row.date_read,
    };
  }
  return result;
}

/**
 * Number of known chapters of a library manga that are not fully read; the single source of the unread
 * badge. Runs as one indexed query, so it stays cheap with any number of read chapters.
 */
export async function countUnreadChapters(
  sourceId: string,
  mangaKey: string,
  db?: Db,
): Promise<number> {
  const target = db ?? (await getDb());
  const row = await target.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM known_chapters k
     WHERE k.source_id = ? AND k.manga_key = ?
       AND NOT EXISTS (
         SELECT 1 FROM reading_log r
         WHERE r.source_id = k.source_id AND r.manga_key = k.manga_key
           AND r.chapter_key = k.chapter_key AND r.page = -1)`,
    [sourceId, mangaKey],
  );
  return row?.n ?? 0;
}

export type ReadEvent = {
  sourceId: string;
  mangaKey: string;
  chapterKey?: string;
  /** Local midday of the day the chapters were read. */
  dateRead: number;
  /** Chapters read that day (default 1). */
  count?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fully read chapters grouped by day and manga (so millions of reads become a few thousand rows),
 * plus known manga titles; the input of reading statistics.
 */
export async function getReadingActivity(): Promise<{
  reads: ReadEvent[];
  titles: Map<string, string>;
}> {
  const db = await getDb();
  const offset = -new Date().getTimezoneOffset() * 60 * 1000;
  const [reads, metas] = await Promise.all([
    db.getAllAsync<{
      source_id: string;
      manga_key: string;
      day: number;
      n: number;
    }>(
      // The offset is inlined as an integer literal: a bound JS number may arrive as REAL, which would
      // turn the day division into a fractional (and therefore useless) grouping key.
      `SELECT source_id, manga_key, CAST(date_read + ${Math.round(offset)} AS INTEGER) / ${DAY_MS} AS day, COUNT(*) AS n
       FROM reading_log WHERE page = -1 AND date_read > 0
       GROUP BY source_id, manga_key, day`,
    ),
    db.getAllAsync<{ source_id: string; manga_key: string; title: string }>(
      "SELECT source_id, manga_key, title FROM manga_meta",
    ),
  ]);
  const titles = new Map<string, string>();
  for (const meta of metas) {
    if (meta.title && meta.title !== meta.manga_key) {
      titles.set(mangaHistoryKey(meta.source_id, meta.manga_key), meta.title);
    }
  }
  return {
    reads: reads.map((row) => ({
      sourceId: row.source_id,
      mangaKey: row.manga_key,
      dateRead: row.day * DAY_MS - offset + DAY_MS / 2,
      count: row.n,
    })),
    titles,
  };
}

// Marks a chapter fully read (page = -1) and moves it to the top of the history. The first read time
// is kept as the chapter's date_read.
export async function markChapterRead(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
  meta?: HistoryMeta,
): Promise<void> {
  if (await trackingWritesDisabled()) return;
  const now = Date.now();
  await runWrite(async (tx) => {
    await tx.runAsync(
      `INSERT INTO reading_log (source_id, manga_key, chapter_key, page, date_read, history_at, chapter_title)
       VALUES (?, ?, ?, -1, ?, ?, ?)
       ON CONFLICT (source_id, manga_key, chapter_key) DO UPDATE SET
         page = -1,
         history_at = excluded.history_at,
         chapter_title = COALESCE(excluded.chapter_title, reading_log.chapter_title)`,
      [sourceId, mangaKey, chapterKeyValue, now, now, meta?.chapterTitle ?? null],
    );
    await upsertMangaMeta(tx, sourceId, mangaKey, meta?.mangaTitle, meta?.cover);
  });
  if (meta?.notify !== false) scheduleNotify();
  scheduleLibraryUnreadSync(sourceId, mangaKey);
}

export async function importChapterReadStates(
  sourceId: string,
  mangaKey: string,
  items: { chapterKey: string; dateRead: number }[],
): Promise<void> {
  if (items.length === 0) return;
  await runWrite(async (tx) => {
    for (let i = 0; i < items.length; i += KEY_CHUNK) {
      const chunk = items.slice(i, i + KEY_CHUNK);
      const values: Array<string | number> = [];
      for (const item of chunk) {
        values.push(sourceId, mangaKey, item.chapterKey, item.dateRead);
      }
      await tx.runAsync(
        `INSERT INTO reading_log (source_id, manga_key, chapter_key, page, date_read)
         VALUES ${chunk.map(() => "(?, ?, ?, -1, ?)").join(", ")}
         ON CONFLICT (source_id, manga_key, chapter_key) DO UPDATE SET
           page = -1, date_read = excluded.date_read`,
        values,
      );
    }
  });
  scheduleNotify();
  scheduleLibraryUnreadSync(sourceId, mangaKey);
}

export async function markChapterUnread(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
): Promise<void> {
  await runWrite((tx) =>
    tx.runAsync(
      `DELETE FROM reading_log WHERE source_id = ? AND manga_key = ? AND chapter_key = ?`,
      [sourceId, mangaKey, chapterKeyValue],
    ),
  );
  scheduleNotify();
  scheduleLibraryUnreadSync(sourceId, mangaKey);
}

export async function markAllChaptersRead(
  sourceId: string,
  mangaKey: string,
  chapterKeys: string[],
  meta?: Pick<HistoryEntry, "mangaTitle" | "cover">,
): Promise<void> {
  if (chapterKeys.length === 0) return;
  if (await trackingWritesDisabled()) return;
  const now = Date.now();
  const unique = [...new Set(chapterKeys)];
  let changed = 0;
  await runWrite(async (tx) => {
    for (let i = 0; i < unique.length; i += KEY_CHUNK) {
      const chunk = unique.slice(i, i + KEY_CHUNK);
      const values: Array<string | number> = [];
      for (const key of chunk) values.push(sourceId, mangaKey, key, now, now);
      // The WHERE clause skips chapters that are already read, so they keep their date and history spot.
      const result = await tx.runAsync(
        `INSERT INTO reading_log (source_id, manga_key, chapter_key, page, date_read, history_at)
         VALUES ${chunk.map(() => "(?, ?, ?, -1, ?, ?)").join(", ")}
         ON CONFLICT (source_id, manga_key, chapter_key) DO UPDATE SET
           page = -1, date_read = excluded.date_read, history_at = excluded.history_at
         WHERE reading_log.page <> -1`,
        values,
      );
      changed += result.changes;
    }
    if (changed > 0) {
      await upsertMangaMeta(tx, sourceId, mangaKey, meta?.mangaTitle, meta?.cover);
    }
  });
  if (changed > 0) {
    scheduleNotify();
    scheduleLibraryUnreadSync(sourceId, mangaKey);
  }
}

export async function markAllChaptersUnread(
  sourceId: string,
  mangaKey: string,
  chapterKeys: string[],
): Promise<void> {
  if (chapterKeys.length === 0) return;
  const unique = [...new Set(chapterKeys)];
  let changed = 0;
  await runWrite(async (tx) => {
    for (let i = 0; i < unique.length; i += KEY_CHUNK) {
      const chunk = unique.slice(i, i + KEY_CHUNK);
      const result = await tx.runAsync(
        `DELETE FROM reading_log WHERE source_id = ? AND manga_key = ?
         AND chapter_key IN (${chunk.map(() => "?").join(", ")})`,
        [sourceId, mangaKey, ...chunk],
      );
      changed += result.changes;
    }
  });
  if (changed > 0) {
    scheduleNotify();
    scheduleLibraryUnreadSync(sourceId, mangaKey);
  }
}

// Stores the last page reached. Page -1 is the "fully read" marker, so this is also how the reader
// re-affirms read chapters.
export async function recordChapterProgress(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
  page: number,
  meta?: HistoryMeta,
): Promise<void> {
  if (await trackingWritesDisabled()) return;
  const now = Date.now();
  await runWrite(async (tx) => {
    await tx.runAsync(
      `INSERT INTO reading_log (source_id, manga_key, chapter_key, page, date_read, history_at, chapter_title)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source_id, manga_key, chapter_key) DO UPDATE SET
         page = excluded.page,
         date_read = excluded.date_read,
         history_at = excluded.history_at,
         chapter_title = COALESCE(excluded.chapter_title, reading_log.chapter_title)`,
      [sourceId, mangaKey, chapterKeyValue, page, now, now, meta?.chapterTitle ?? null],
    );
    await upsertMangaMeta(tx, sourceId, mangaKey, meta?.mangaTitle, meta?.cover);
  });
  if (meta?.notify !== false) scheduleNotify();
  // Also for partial progress: the library sorts by the latest reading time.
  scheduleLibraryUnreadSync(sourceId, mangaKey);
}

type HistoryRow = {
  source_id: string;
  manga_key: string;
  chapter_key: string;
  page: number;
  date_read: number;
  history_at: number | null;
  chapter_title: string | null;
  manga_title: string | null;
  cover: string | null;
};

function toHistoryEntry(row: HistoryRow): HistoryEntry {
  return {
    sourceId: row.source_id,
    mangaKey: row.manga_key,
    chapterKey: row.chapter_key,
    mangaTitle: row.manga_title ?? row.manga_key,
    chapterTitle: row.chapter_title ?? undefined,
    cover: row.cover ?? undefined,
    dateRead: row.history_at ?? row.date_read,
    page: row.page,
  };
}

const HISTORY_SELECT = `
  SELECT r.source_id, r.manga_key, r.chapter_key, r.page, r.date_read, r.history_at, r.chapter_title,
         m.title AS manga_title, m.cover AS cover
  FROM reading_log r
  LEFT JOIN manga_meta m ON m.source_id = r.source_id AND m.manga_key = r.manga_key`;

export async function getMangaHistoryForEntry(
  sourceId: string,
  mangaKey: string,
): Promise<HistoryEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<HistoryRow>(
    `${HISTORY_SELECT}
     WHERE r.source_id = ? AND r.manga_key = ? AND r.history_at IS NOT NULL
     ORDER BY r.history_at DESC`,
    [sourceId, mangaKey],
  );
  return rows.map(toHistoryEntry);
}

/**
 * History, newest first: every chapter with progress (chapters that were only imported, for example from
 * a backup, are included with their read date). Paged: pass `limit` and `offset` for long histories.
 */
export async function getHistoryEntries(
  limit?: number,
  offset = 0,
): Promise<HistoryEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<HistoryRow>(
    `${HISTORY_SELECT}
     ORDER BY COALESCE(r.history_at, r.date_read) DESC
     LIMIT ? OFFSET ?`,
    [limit ?? -1, offset],
  );
  return rows.map(toHistoryEntry);
}

export async function getHistoryCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM reading_log",
  );
  return row?.n ?? 0;
}

/** Distinct sources that appear in the history (privacy settings check which are NSFW). */
export async function getHistorySourceIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ source_id: string }>(
    "SELECT DISTINCT source_id FROM reading_log",
  );
  return rows.map((row) => row.source_id);
}

async function dropOrphanMangaMeta(tx: Db): Promise<void> {
  await tx.runAsync(
    `DELETE FROM manga_meta WHERE NOT EXISTS (
       SELECT 1 FROM reading_log r
       WHERE r.source_id = manga_meta.source_id AND r.manga_key = manga_meta.manga_key)`,
  );
}

export async function clearHistory(): Promise<void> {
  await removeHistorySince(0);
}

export async function removeHistorySince(cutoffMs: number): Promise<void> {
  await runWrite(async (tx) => {
    if (cutoffMs <= 0) await tx.runAsync("DELETE FROM reading_log");
    else {
      await tx.runAsync(
        "DELETE FROM reading_log WHERE COALESCE(history_at, date_read) >= ? OR date_read >= ?",
        [cutoffMs, cutoffMs],
      );
    }
    await dropOrphanMangaMeta(tx);
  });
  scheduleNotify();
  // Read marks changed for many manga at once; refresh every library unread badge.
  void import("@/services/library")
    .then((mod) => mod.recomputeAllLibraryUnread())
    .catch(() => undefined);
}

export async function removeChapterFromHistory(
  sourceId: string,
  mangaKey: string,
  chapterKeyValue: string,
): Promise<void> {
  await markChapterUnread(sourceId, mangaKey, chapterKeyValue);
}

export async function removeMangaHistoryGroup(
  sourceId: string,
  mangaKey: string,
  chapterKeys: string[],
): Promise<void> {
  await markAllChaptersUnread(sourceId, mangaKey, chapterKeys);
}

export type MangaReadingResume = {
  chapterKey: string;
  chapterTitle?: string;
  page: number;
};

// "Continue reading": the chapter with the most recent activity. A fully read chapter resumes at page 0.
export async function getMangaReadingResume(
  sourceId: string,
  mangaKey: string,
): Promise<MangaReadingResume | null> {
  const db = await getDb();
  const latest = await db.getFirstAsync<{ chapter_key: string; page: number }>(
    `SELECT chapter_key, page FROM reading_log
     WHERE source_id = ? AND manga_key = ?
     ORDER BY COALESCE(history_at, date_read) DESC LIMIT 1`,
    [sourceId, mangaKey],
  );
  if (!latest) return null;
  return {
    chapterKey: latest.chapter_key,
    page: latest.page >= 0 ? latest.page : 0,
  };
}

/** True when anything was ever read or recorded for the manga (used by "skip manga never read"). */
export async function hasReadingActivity(
  sourceId: string,
  mangaKey: string,
): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ found: number }>(
    "SELECT 1 AS found FROM reading_log WHERE source_id = ? AND manga_key = ? LIMIT 1",
    [sourceId, mangaKey],
  );
  return row != null;
}

/** Time of the latest reading activity of one manga (history time when present, else the read date). */
export async function getMangaLastRead(
  sourceId: string,
  mangaKey: string,
  db?: Db,
): Promise<number | undefined> {
  const target = db ?? (await getDb());
  const row = await target.getFirstAsync<{ last: number | null }>(
    `SELECT MAX(COALESCE(history_at, date_read)) AS last FROM reading_log
     WHERE source_id = ? AND manga_key = ?`,
    [sourceId, mangaKey],
  );
  return row?.last ?? undefined;
}
