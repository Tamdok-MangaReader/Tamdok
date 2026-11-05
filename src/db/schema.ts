/**
 * SQLite schema of the app. Every entry of MIGRATIONS is applied once, in order, and the number of
 * applied entries is stored in `PRAGMA user_version`. Never edit an applied migration: append a new one.
 *
 * DDL is written with `{s}` as the schema placeholder so the very same statements can also create
 * the tables of a backup file that is attached as another schema (see backup.ts).
 */

/** Bumped by one for every appended migration. */
export const SCHEMA_VERSION = 1;

const TABLES_V1: string[] = [
  // Small preferences and settings (theme, app settings, source settings, bookmarks, ...).
  `CREATE TABLE IF NOT EXISTS {s}.kv (
     key TEXT NOT NULL PRIMARY KEY,
     value TEXT NOT NULL
   ) WITHOUT ROWID`,

  // Title and cover of every manga in the reading log, stored once instead of per chapter.
  `CREATE TABLE IF NOT EXISTS {s}.manga_meta (
     source_id TEXT NOT NULL,
     manga_key TEXT NOT NULL,
     title TEXT NOT NULL,
     cover TEXT,
     PRIMARY KEY (source_id, manga_key)
   ) WITHOUT ROWID`,

  // One row per chapter with reading progress. page = -1 means fully read. history_at is the time the
  // chapter last moved to the top of the History tab (NULL for progress that was only imported).
  `CREATE TABLE IF NOT EXISTS {s}.reading_log (
     source_id TEXT NOT NULL,
     manga_key TEXT NOT NULL,
     chapter_key TEXT NOT NULL,
     page INTEGER NOT NULL,
     date_read INTEGER NOT NULL,
     history_at INTEGER,
     chapter_title TEXT,
     -- Bulk mark state, derived from the log (see bulkRefreshStatements): 0 normal, -1 hidden member of a
     -- bulk group, n > 0 the representative row of a group of n chapters.
     bulk INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (source_id, manga_key, chapter_key)
   ) WITHOUT ROWID`,

  // The chapter the reader opened last, for "Continue" when it left no reading record (already read).
  `CREATE TABLE IF NOT EXISTS {s}.last_opened_chapter (
     source_id TEXT NOT NULL,
     manga_key TEXT NOT NULL,
     chapter_key TEXT NOT NULL,
     page INTEGER NOT NULL,
     opened_at INTEGER NOT NULL,
     PRIMARY KEY (source_id, manga_key)
   ) WITHOUT ROWID`,

  `CREATE TABLE IF NOT EXISTS {s}.categories (
     id TEXT NOT NULL PRIMARY KEY,
     name TEXT NOT NULL,
     sort_order INTEGER NOT NULL
   ) WITHOUT ROWID`,

  `CREATE TABLE IF NOT EXISTS {s}.library_entries (
     source_id TEXT NOT NULL,
     manga_key TEXT NOT NULL,
     title TEXT NOT NULL,
     cover TEXT,
     date_added INTEGER NOT NULL,
     unread_count INTEGER,
     downloaded_count INTEGER,
     last_refreshed INTEGER,
     status TEXT,
     update_failed INTEGER NOT NULL DEFAULT 0,
     last_attempt_at INTEGER,
     favorite INTEGER NOT NULL DEFAULT 0,
     chapter_count INTEGER NOT NULL DEFAULT 0,
     -- Time of the latest reading activity; derived from reading_log and owned by the database layer.
     last_read_at INTEGER,
     PRIMARY KEY (source_id, manga_key)
   ) WITHOUT ROWID`,

  `CREATE TABLE IF NOT EXISTS {s}.library_entry_categories (
     source_id TEXT NOT NULL,
     manga_key TEXT NOT NULL,
     category_id TEXT NOT NULL,
     PRIMARY KEY (source_id, manga_key, category_id)
   ) WITHOUT ROWID`,

  // Chapter keys of a library manga in source order (position 0 first). Kept out of the entry row so the
  // library list does not carry hundreds of thousands of strings in memory.
  `CREATE TABLE IF NOT EXISTS {s}.known_chapters (
     source_id TEXT NOT NULL,
     manga_key TEXT NOT NULL,
     chapter_key TEXT NOT NULL,
     position INTEGER NOT NULL,
     PRIMARY KEY (source_id, manga_key, chapter_key)
   ) WITHOUT ROWID`,

  `CREATE TABLE IF NOT EXISTS {s}.downloads (
     source_id TEXT NOT NULL,
     manga_key TEXT NOT NULL,
     chapter_key TEXT NOT NULL,
     manga_title TEXT NOT NULL,
     chapter_title TEXT,
     status TEXT NOT NULL,
     progress REAL NOT NULL DEFAULT 0,
     date_added INTEGER NOT NULL,
     error TEXT,
     PRIMARY KEY (source_id, manga_key, chapter_key)
   ) WITHOUT ROWID`,
];

// The schema qualifier of an index goes on the index name: "CREATE INDEX s.idx ON table (...)".
const INDEXES_V1: string[] = [
  // History tab: newest first, paged.
  // Bulk group members (bulk < 0) are not listed, so they are not indexed either.
  `CREATE INDEX IF NOT EXISTS {s}.idx_log_recent ON reading_log (COALESCE(history_at, date_read) DESC) WHERE bulk >= 0`,
  // Statistics: only fully read chapters, ordered by time.
  `CREATE INDEX IF NOT EXISTS {s}.idx_log_done ON reading_log (date_read, source_id, manga_key) WHERE page = -1`,
  `CREATE INDEX IF NOT EXISTS {s}.idx_lec_category ON library_entry_categories (category_id)`,
  `CREATE INDEX IF NOT EXISTS {s}.idx_known_order ON known_chapters (source_id, manga_key, position)`,
  `CREATE INDEX IF NOT EXISTS {s}.idx_downloads_status ON downloads (status)`,
];

/** All DDL of the current schema for the given schema name ("main" or an attached database). */
export function schemaStatements(schema = "main"): string[] {
  return [...TABLES_V1, ...INDEXES_V1].map((statement) =>
    statement.replace(/\{s\}/g, schema),
  );
}

/** Names of the data tables, used by backups and the storage statistics. */
export const DATA_TABLES = [
  "kv",
  "manga_meta",
  "reading_log",
  "categories",
  "library_entries",
  "library_entry_categories",
  "known_chapters",
  "downloads",
  "last_opened_chapter",
] as const;

export type DataTable = (typeof DATA_TABLES)[number];

/** This many chapters of one manga sharing one history time are a bulk mark ("mark all read"), not reading. */
export const BULK_READ_THRESHOLD = 5;

/**
 * Recomputes reading_log.bulk. Values: 0 = ordinary chapter, -1 = member of a bulk group (hidden from the
 * history and the statistics), n > 0 = the one representative row of a bulk group of n chapters (shown in
 * the history as a single entry). Pass `scoped` to limit it to one manga: the statements then take
 * `[sourceId, mangaKey]` parameters, in order, for each `?`.
 */
export function bulkRefreshStatements(scoped: boolean): string[] {
  const where = scoped ? " AND source_id = ? AND manga_key = ?" : "";
  const inner = scoped ? " AND source_id = ? AND manga_key = ?" : "";
  return [
    `UPDATE reading_log SET bulk = 0 WHERE bulk <> 0${where}`,
    `UPDATE reading_log SET bulk = -1
     WHERE page = -1${where} AND (source_id, manga_key, COALESCE(history_at, date_read)) IN (
       SELECT source_id, manga_key, COALESCE(history_at, date_read) FROM reading_log
       WHERE page = -1${inner}
       GROUP BY source_id, manga_key, COALESCE(history_at, date_read)
       HAVING COUNT(*) >= ${BULK_READ_THRESHOLD})`,
    `UPDATE reading_log SET bulk = g.n
     FROM (
       SELECT source_id, manga_key, MIN(chapter_key) AS chapter_key, COUNT(*) AS n
       FROM reading_log WHERE bulk = -1${inner}
       GROUP BY source_id, manga_key, COALESCE(history_at, date_read)
     ) AS g
     WHERE reading_log.source_id = g.source_id AND reading_log.manga_key = g.manga_key
       AND reading_log.chapter_key = g.chapter_key`,
  ];
}

/** Migration steps by target version (index 0 builds version 1). */
export const MIGRATIONS: Array<() => string[]> = [() => schemaStatements("main")];

/** Fills library_entries.last_read_at from the reading log (after imports and restores). */
export const REFRESH_LAST_READ_SQL = `UPDATE library_entries SET last_read_at = (
  SELECT MAX(COALESCE(r.history_at, r.date_read)) FROM reading_log r
  WHERE r.source_id = library_entries.source_id AND r.manga_key = library_entries.manga_key)`;
