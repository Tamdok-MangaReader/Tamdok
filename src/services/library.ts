import { getValue, removeValue, setValue } from "@/constants/storage";
import { getDb, insertMany, runWrite, type Db } from "@/db/database";
import { LIBRARY_SETTINGS_KEY } from "@/db/legacy-import";
import { REFRESH_LAST_READ_SQL } from "@/db/schema";
import { peekMangaDetailCache } from "@/services/manga-detail-cache";
import { getMangaDownloads, removeMangaDownloads } from "@/services/downloads";
import {
  countUnreadChapters,
  getMangaChapterProgress,
  getMangaLastRead,
  type ChapterProgress,
} from "@/services/manga-tracking";
import { notifyMangaDataChanged } from "@/utils/manga-events";
import type { LibraryFilters, LibrarySortMode } from "@/services/app-settings";

export const ALL_CATEGORY_ID = "all";

export type LibraryCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export type LibraryUpdateInterval =
  "never" | "1h" | "6h" | "12h" | "24h" | "48h";

export type LibraryEntry = {
  sourceId: string;
  mangaKey: string;
  title: string;
  cover?: string;
  categoryIds: string[];
  dateAdded: number;
  unreadCount?: number;
  downloadedCount?: number;
  lastRefreshed?: number;
  status?: "unknown" | "ongoing" | "completed" | "hiatus" | "cancelled";
  /** Number of known chapters; the keys themselves live in the known_chapters table. */
  chapterCount?: number;
  /** Latest reading activity (maintained by the database layer, not written with the entry). */
  lastReadAt?: number;
  updateFailed?: boolean;
  lastAttemptAt?: number;
  /** Pinned by the user: shown with a star and sorted first. Cleared when the manga leaves the library. */
  favorite?: boolean;
};

export type LibrarySettings = {
  currentCategoryId: string;
  defaultCategoryId: string;
  excludedCategoryIds: string[];
  updateOnWifiOnly: boolean;
  updateInterval: LibraryUpdateInterval;
  skipUnreadChapters: boolean;
  skipCompletedStatus: boolean;
  skipUnreadManga: boolean;
  refreshMetadata: boolean;
  backgroundRefresh: boolean;
  lastAutoRefreshAt?: number;
};

const DEFAULT_CATEGORIES: LibraryCategory[] = [
  { id: ALL_CATEGORY_ID, name: "All", sortOrder: 0 },
];

function entryKey(sourceId: string, mangaKey: string): string {
  return `${sourceId}:${mangaKey}`;
}

/** The unread badge of an entry; the database keeps it in sync with reading progress. */
export function resolveLibraryUnreadCount(
  entry: Pick<LibraryEntry, "unreadCount">,
): number {
  return entry.unreadCount ?? 0;
}

export const LIBRARY_SORT_MODES: LibrarySortMode[] = [
  "unread",
  "title",
  "recent",
  "lastRead",
  "chapters",
  "downloaded",
];

function titleSortKey(title: string): string {
  return title.trim().toLocaleLowerCase();
}

export function sortLibraryEntries(
  entries: LibraryEntry[],
  sortMode: LibrarySortMode,
  lastReadAt: Map<string, number> = new Map(),
  reversed = false,
  unreadOf: (entry: LibraryEntry) => number = (entry) => entry.unreadCount ?? 0,
  favoritesFirst = true,
): LibraryEntry[] {
  const next = [...entries];
  const byTitle = (a: LibraryEntry, b: LibraryEntry) =>
    titleSortKey(a.title).localeCompare(titleSortKey(b.title), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  next.sort((a, b) => {
    switch (sortMode) {
      case "title":
        return titleSortKey(a.title).localeCompare(
          titleSortKey(b.title),
          undefined,
          { numeric: true, sensitivity: "base" },
        );
      case "recent":
        return b.dateAdded - a.dateAdded;
      case "lastRead": {
        const aRead = lastReadAt.get(entryKey(a.sourceId, a.mangaKey)) ?? 0;
        const bRead = lastReadAt.get(entryKey(b.sourceId, b.mangaKey)) ?? 0;
        if (aRead !== bRead) return bRead - aRead;
        return titleSortKey(a.title).localeCompare(
          titleSortKey(b.title),
          undefined,
          { numeric: true, sensitivity: "base" },
        );
      }
      case "chapters": {
        const diff =
          (b.chapterCount ?? 0) - (a.chapterCount ?? 0);
        return diff !== 0 ? diff : byTitle(a, b);
      }
      case "downloaded": {
        const diff = (b.downloadedCount ?? 0) - (a.downloadedCount ?? 0);
        return diff !== 0 ? diff : byTitle(a, b);
      }
      case "unread":
      default: {
        const unreadDiff = unreadOf(b) - unreadOf(a);
        if (unreadDiff !== 0) return unreadDiff;
        return titleSortKey(a.title).localeCompare(
          titleSortKey(b.title),
          undefined,
          { numeric: true, sensitivity: "base" },
        );
      }
    }
  });
  const ordered = reversed ? next.reverse() : next;
  // Favorites always lead (also when the order is reversed); order inside each group is kept.
  if (!favoritesFirst || !ordered.some((entry) => entry.favorite)) return ordered;
  return [
    ...ordered.filter((entry) => entry.favorite),
    ...ordered.filter((entry) => !entry.favorite),
  ];
}

/** A finished series: ended (completed/cancelled) with every known chapter read. */
export function isLibraryEntryFinished(
  entry: Pick<LibraryEntry, "status" | "chapterCount">,
  unreadCount: number,
): boolean {
  return (
    (entry.status === "completed" || entry.status === "cancelled") &&
    unreadCount === 0 &&
    (entry.chapterCount ?? 0) > 0
  );
}

/** True when no filter narrows the library. */
export function hasActiveLibraryFilters(filters: LibraryFilters): boolean {
  return (
    filters.statuses.length > 0 ||
    filters.readState !== "all" ||
    filters.downloaded !== "all" ||
    filters.favorites ||
    filters.sourceIds.length > 0
  );
}

export function filterLibraryEntries(
  entries: LibraryEntry[],
  filters: LibraryFilters,
  unreadOf: (entry: LibraryEntry) => number = (entry) => entry.unreadCount ?? 0,
): LibraryEntry[] {
  if (!hasActiveLibraryFilters(filters)) return entries;
  return entries.filter((entry) => {
    if (
      filters.statuses.length > 0 &&
      !filters.statuses.includes(entry.status ?? "unknown")
    )
      return false;
    if (
      filters.sourceIds.length > 0 &&
      !filters.sourceIds.includes(entry.sourceId)
    )
      return false;
    if (filters.readState !== "all") {
      const unreadCount = unreadOf(entry);
      if (filters.readState === "finished") {
        if (!isLibraryEntryFinished(entry, unreadCount)) return false;
      } else {
        const unread = unreadCount > 0;
        if (filters.readState === "unread" ? !unread : unread) return false;
      }
    }
    if (filters.favorites && !entry.favorite) return false;
    if (filters.downloaded !== "all") {
      const downloaded = (entry.downloadedCount ?? 0) > 0;
      if (filters.downloaded === "downloaded" ? !downloaded : downloaded)
        return false;
    }
    return true;
  });
}


// ---------------------------------------------------------------------------------------------------
// Storage. Library data lives in SQLite: `library_entries` (+ `library_entry_categories`), `categories`,
// `known_chapters` (chapter keys of every library manga, kept out of memory) and the update settings in
// the key-value table. Entries and categories are mirrored in memory (they are small and drive every
// library screen); each change writes only the rows it touched.
// ---------------------------------------------------------------------------------------------------

type LibraryState = {
  categories: LibraryCategory[];
  entries: Map<string, LibraryEntry>;
  settings: LibrarySettings;
};

function defaultSettings(): LibrarySettings {
  return {
    currentCategoryId: ALL_CATEGORY_ID,
    defaultCategoryId: ALL_CATEGORY_ID,
    excludedCategoryIds: [],
    updateOnWifiOnly: false,
    updateInterval: "12h",
    skipUnreadChapters: false,
    skipCompletedStatus: false,
    skipUnreadManga: false,
    refreshMetadata: true,
    backgroundRefresh: false,
  };
}

function normalizeCategories(
  categories: LibraryCategory[],
  defaultCategoryId: string,
): LibraryCategory[] {
  const allCategory: LibraryCategory = {
    id: ALL_CATEGORY_ID,
    name: "All",
    sortOrder: 0,
  };
  const userCategories = categories.filter(
    (category) => category.id !== ALL_CATEGORY_ID,
  );

  if (
    defaultCategoryId === ALL_CATEGORY_ID ||
    !categories.some((category) => category.id === ALL_CATEGORY_ID)
  ) {
    return [
      allCategory,
      ...userCategories.map((category, index) => ({
        ...category,
        sortOrder: index + 1,
      })),
    ];
  }

  return categories.map((category, index) => ({
    ...category,
    sortOrder: index,
  }));
}

type EntryRow = {
  source_id: string;
  manga_key: string;
  title: string;
  cover: string | null;
  date_added: number;
  unread_count: number | null;
  downloaded_count: number | null;
  last_refreshed: number | null;
  status: string | null;
  update_failed: number;
  last_attempt_at: number | null;
  favorite: number;
  chapter_count: number;
  last_read_at: number | null;
};

function rowToEntry(row: EntryRow, categoryIds: string[]): LibraryEntry {
  const entry: LibraryEntry = {
    sourceId: row.source_id,
    mangaKey: row.manga_key,
    title: row.title,
    cover: row.cover ?? undefined,
    categoryIds,
    dateAdded: row.date_added,
    unreadCount: row.unread_count ?? undefined,
    downloadedCount: row.downloaded_count ?? undefined,
    lastRefreshed: row.last_refreshed ?? undefined,
    status: (row.status as LibraryEntry["status"]) ?? undefined,
    chapterCount: row.chapter_count,
    lastReadAt: row.last_read_at ?? undefined,
  };
  if (row.update_failed) entry.updateFailed = true;
  if (row.last_attempt_at != null) entry.lastAttemptAt = row.last_attempt_at;
  if (row.favorite) entry.favorite = true;
  return entry;
}

let memoryState: LibraryState | null = null;
let stateLoad: Promise<LibraryState> | null = null;

export function invalidateLibraryCache(): void {
  memoryState = null;
  stateLoad = null;
}

async function loadSettings(): Promise<LibrarySettings> {
  const stored = await getValue<Partial<LibrarySettings> | null>(
    LIBRARY_SETTINGS_KEY,
    null,
  );
  const defaults = defaultSettings();
  if (!stored) return defaults;
  return {
    ...defaults,
    ...stored,
    excludedCategoryIds: stored.excludedCategoryIds ?? [],
  };
}

async function readStore(): Promise<LibraryState> {
  if (memoryState) return memoryState;
  if (!stateLoad) {
    stateLoad = (async () => {
      const db = await getDb();
      const [categoryRows, entryRows, linkRows, settings] = await Promise.all([
        db.getAllAsync<{ id: string; name: string; sort_order: number }>(
          "SELECT id, name, sort_order FROM categories ORDER BY sort_order",
        ),
        db.getAllAsync<EntryRow>("SELECT * FROM library_entries"),
        db.getAllAsync<{
          source_id: string;
          manga_key: string;
          category_id: string;
        }>("SELECT source_id, manga_key, category_id FROM library_entry_categories"),
        loadSettings(),
      ]);

      const links = new Map<string, string[]>();
      for (const link of linkRows) {
        const key = entryKey(link.source_id, link.manga_key);
        const list = links.get(key);
        if (list) list.push(link.category_id);
        else links.set(key, [link.category_id]);
      }
      const entries = new Map<string, LibraryEntry>();
      for (const row of entryRows) {
        const key = entryKey(row.source_id, row.manga_key);
        entries.set(key, rowToEntry(row, links.get(key) ?? []));
      }

      const categories = normalizeCategories(
        categoryRows.length > 0
          ? categoryRows.map((row) => ({
              id: row.id,
              name: row.name,
              sortOrder: row.sort_order,
            }))
          : DEFAULT_CATEGORIES,
        settings.defaultCategoryId,
      );
      memoryState = { categories, entries, settings };
      return memoryState;
    })().finally(() => {
      stateLoad = null;
    });
  }
  return stateLoad;
}

async function writeEntryRow(tx: Db, entry: LibraryEntry): Promise<void> {
  await tx.runAsync(
    `INSERT INTO library_entries
       (source_id, manga_key, title, cover, date_added, unread_count, downloaded_count, last_refreshed,
        status, update_failed, last_attempt_at, favorite, chapter_count, last_read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
       (SELECT MAX(COALESCE(history_at, date_read)) FROM reading_log WHERE source_id = ? AND manga_key = ?))
     ON CONFLICT (source_id, manga_key) DO UPDATE SET
       title = excluded.title, cover = excluded.cover, date_added = excluded.date_added,
       unread_count = excluded.unread_count, downloaded_count = excluded.downloaded_count,
       last_refreshed = excluded.last_refreshed, status = excluded.status,
       update_failed = excluded.update_failed, last_attempt_at = excluded.last_attempt_at,
       favorite = excluded.favorite, chapter_count = excluded.chapter_count`,
    [
      entry.sourceId,
      entry.mangaKey,
      entry.title,
      entry.cover ?? null,
      entry.dateAdded,
      entry.unreadCount ?? null,
      entry.downloadedCount ?? null,
      entry.lastRefreshed ?? null,
      entry.status ?? null,
      entry.updateFailed ? 1 : 0,
      entry.lastAttemptAt ?? null,
      entry.favorite ? 1 : 0,
      entry.chapterCount ?? 0,
      entry.sourceId,
      entry.mangaKey,
    ],
  );
}

async function writeEntryCategories(tx: Db, entry: LibraryEntry): Promise<void> {
  await tx.runAsync(
    "DELETE FROM library_entry_categories WHERE source_id = ? AND manga_key = ?",
    [entry.sourceId, entry.mangaKey],
  );
  await insertMany(
    tx,
    "INSERT OR IGNORE INTO library_entry_categories (source_id, manga_key, category_id)",
    3,
    entry.categoryIds.map((id) => [entry.sourceId, entry.mangaKey, id]),
  );
}

async function deleteEntryRows(
  tx: Db,
  sourceId: string,
  mangaKey: string,
): Promise<void> {
  for (const table of [
    "library_entries",
    "library_entry_categories",
    "known_chapters",
  ]) {
    await tx.runAsync(
      `DELETE FROM ${table} WHERE source_id = ? AND manga_key = ?`,
      [sourceId, mangaKey],
    );
  }
}

async function writeCategories(tx: Db, categories: LibraryCategory[]) {
  await tx.runAsync("DELETE FROM categories");
  await insertMany(
    tx,
    "INSERT INTO categories (id, name, sort_order)",
    3,
    categories.map((category) => [
      category.id,
      category.name,
      category.sortOrder,
    ]),
  );
}

/**
 * Replaces the stored chapter keys of a manga when they differ. Returns the resulting number of keys.
 * Order matters (it is the source order), so any difference rewrites the list.
 */
async function replaceKnownChapters(
  tx: Db,
  sourceId: string,
  mangaKey: string,
  keys: string[],
): Promise<number> {
  const unique = [...new Set(keys)];
  const existing = await tx.getAllAsync<{ chapter_key: string }>(
    "SELECT chapter_key FROM known_chapters WHERE source_id = ? AND manga_key = ? ORDER BY position",
    [sourceId, mangaKey],
  );
  const same =
    existing.length === unique.length &&
    existing.every((row, index) => row.chapter_key === unique[index]);
  if (same) return unique.length;
  await tx.runAsync(
    "DELETE FROM known_chapters WHERE source_id = ? AND manga_key = ?",
    [sourceId, mangaKey],
  );
  await insertMany(
    tx,
    "INSERT INTO known_chapters (source_id, manga_key, chapter_key, position)",
    4,
    unique.map((key, position) => [sourceId, mangaKey, key, position]),
  );
  return unique.length;
}

type Changes = {
  /** Entries whose row (and category links) must be written. */
  entries?: LibraryEntry[];
  /** Entries only the row of which changed (category links are untouched). */
  rows?: LibraryEntry[];
  removed?: Array<{ sourceId: string; mangaKey: string }>;
  categories?: boolean;
  settings?: boolean;
  /** Extra writes run in the same transaction. */
  extra?: (tx: Db) => Promise<void>;
};

// Persists what changed, in one transaction. Listeners are notified first so the UI reacts immediately;
// the write is awaited so callers know it is durable.
async function commit(state: LibraryState, changes: Changes): Promise<void> {
  notifyMangaDataChanged();
  const settingsSnapshot = changes.settings
    ? { ...state.settings, excludedCategoryIds: [...state.settings.excludedCategoryIds] }
    : null;
  const categoriesSnapshot = changes.categories
    ? state.categories.map((category) => ({ ...category }))
    : null;
  await runWrite(async (tx) => {
    for (const removed of changes.removed ?? []) {
      await deleteEntryRows(tx, removed.sourceId, removed.mangaKey);
    }
    if (categoriesSnapshot) await writeCategories(tx, categoriesSnapshot);
    for (const entry of changes.entries ?? []) {
      await writeEntryRow(tx, entry);
      await writeEntryCategories(tx, entry);
    }
    for (const entry of changes.rows ?? []) await writeEntryRow(tx, entry);
    await changes.extra?.(tx);
  });
  if (settingsSnapshot) await setValue(LIBRARY_SETTINGS_KEY, settingsSnapshot);
}

export function isAllCategory(categoryId: string): boolean {
  return categoryId === ALL_CATEGORY_ID;
}

export function libraryCategoryCount(
  entries: LibraryEntry[],
  categoryId: string,
): number {
  if (isAllCategory(categoryId)) return entries.length;
  return entries.filter((entry) => entry.categoryIds.includes(categoryId))
    .length;
}

export function isAllCategoryLocked(defaultCategoryId: string): boolean {
  return defaultCategoryId === ALL_CATEGORY_ID;
}

export async function getLibraryCategories(): Promise<LibraryCategory[]> {
  const store = await readStore();
  return [...store.categories].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getUserLibraryCategories(): Promise<LibraryCategory[]> {
  const categories = await getLibraryCategories();
  return categories.filter((category) => !isAllCategory(category.id));
}

export async function hasCustomLibraryCategories(): Promise<boolean> {
  const categories = await getUserLibraryCategories();
  return categories.length > 0;
}

export async function getCurrentCategoryId(): Promise<string> {
  const store = await readStore();
  return store.settings.currentCategoryId;
}

export async function setCurrentCategoryId(categoryId: string): Promise<void> {
  const store = await readStore();
  store.settings.currentCategoryId = categoryId;
  await commit(store, { settings: true });
}

export async function getDefaultCategoryId(): Promise<string> {
  const store = await readStore();
  return store.settings.defaultCategoryId;
}

export async function setDefaultCategoryId(categoryId: string): Promise<void> {
  const store = await readStore();
  store.settings.defaultCategoryId = categoryId;
  store.settings.currentCategoryId = categoryId;
  store.categories = normalizeCategories(store.categories, categoryId);
  await commit(store, { settings: true, categories: true });
}

export async function addLibraryCategory(
  name: string,
): Promise<LibraryCategory> {
  const store = await readStore();
  const category: LibraryCategory = {
    id: `cat_${Date.now()}`,
    name,
    sortOrder: store.categories.length,
  };
  store.categories.push(category);
  await commit(store, { categories: true });
  return category;
}

export async function renameLibraryCategory(
  categoryId: string,
  name: string,
): Promise<void> {
  if (isAllCategory(categoryId)) return;
  const store = await readStore();
  const category = store.categories.find((item) => item.id === categoryId);
  if (!category) return;
  category.name = name;
  await commit(store, { categories: true });
}

export async function removeLibraryCategory(categoryId: string): Promise<void> {
  if (isAllCategory(categoryId)) return;
  const store = await readStore();
  store.categories = store.categories.filter((item) => item.id !== categoryId);
  for (const entry of store.entries.values()) {
    entry.categoryIds = entry.categoryIds.filter((id) => id !== categoryId);
  }
  const settingsChanged =
    store.settings.currentCategoryId === categoryId ||
    store.settings.defaultCategoryId === categoryId ||
    store.settings.excludedCategoryIds.includes(categoryId);
  if (store.settings.currentCategoryId === categoryId) {
    store.settings.currentCategoryId = ALL_CATEGORY_ID;
  }
  if (store.settings.defaultCategoryId === categoryId) {
    store.settings.defaultCategoryId = ALL_CATEGORY_ID;
  }
  store.settings.excludedCategoryIds = store.settings.excludedCategoryIds.filter(
    (id) => id !== categoryId,
  );
  await commit(store, {
    categories: true,
    settings: settingsChanged,
    extra: (tx) =>
      tx
        .runAsync("DELETE FROM library_entry_categories WHERE category_id = ?", [
          categoryId,
        ])
        .then(() => undefined),
  });
}

export async function reorderLibraryCategories(
  orderedIds: string[],
): Promise<void> {
  const store = await readStore();
  const byId = new Map(
    store.categories.map((category) => [category.id, category]),
  );
  const reordered: LibraryCategory[] = [];
  for (const id of orderedIds) {
    const category = byId.get(id);
    if (category) reordered.push(category);
  }
  for (const category of store.categories) {
    if (!reordered.some((item) => item.id === category.id)) {
      reordered.push(category);
    }
  }
  store.categories = reordered.map((category, index) => ({
    ...category,
    sortOrder: index,
  }));
  await commit(store, { categories: true });
}

export async function getLibraryEntries(
  categoryId?: string,
): Promise<LibraryEntry[]> {
  const [store, db] = await Promise.all([readStore(), getDb()]);
  const counts = await db.getAllAsync<{
    source_id: string;
    manga_key: string;
    n: number;
  }>(
    `SELECT source_id, manga_key, COUNT(*) AS n FROM downloads
     WHERE status = 'completed' GROUP BY source_id, manga_key`,
  );
  const downloadCounts = new Map<string, number>();
  for (const item of counts) {
    downloadCounts.set(entryKey(item.source_id, item.manga_key), item.n);
  }
  const withCounts = [...store.entries.values()]
    .sort((a, b) => b.dateAdded - a.dateAdded)
    .map((entry) => ({
      ...entry,
      categoryIds: [...entry.categoryIds],
      downloadedCount:
        downloadCounts.get(entryKey(entry.sourceId, entry.mangaKey)) ?? 0,
    }));
  if (!categoryId || isAllCategory(categoryId)) return withCounts;
  return withCounts.filter((entry) => entry.categoryIds.includes(categoryId));
}

export async function getLibraryEntryCount(): Promise<number> {
  const store = await readStore();
  return store.entries.size;
}

export async function isInLibrary(
  sourceId: string,
  mangaKey: string,
): Promise<boolean> {
  const store = await readStore();
  return store.entries.has(entryKey(sourceId, mangaKey));
}

type EntryBadgeMeta = Partial<
  Pick<LibraryEntry, "unreadCount" | "downloadedCount" | "status">
> & { knownChapterKeys?: string[] };

// Fills the badges of a brand-new entry from what is already known (the detail cache, reading progress,
// downloads). Returns the chapter keys to store with the entry, if any are known.
async function applyEntryBadges(
  entry: LibraryEntry,
  meta?: EntryBadgeMeta,
): Promise<string[] | undefined> {
  if (meta?.unreadCount !== undefined) entry.unreadCount = meta.unreadCount;
  if (meta?.downloadedCount !== undefined)
    entry.downloadedCount = meta.downloadedCount;
  if (meta?.status !== undefined) entry.status = meta.status;

  const cached = peekMangaDetailCache(entry.sourceId, entry.mangaKey);
  const cachedKeys = cached?.manga.chapters?.map((chapter) => chapter.key) ?? [];
  const keys =
    meta?.knownChapterKeys && meta.knownChapterKeys.length >= cachedKeys.length
      ? meta.knownChapterKeys
      : cachedKeys;
  const needsUnread = entry.unreadCount === undefined || keys.length > 0;
  const needsDownloads = entry.downloadedCount === undefined;

  const [progress, downloads] = await Promise.all([
    needsUnread && keys.length > 0
      ? getMangaChapterProgress(entry.sourceId, entry.mangaKey)
      : Promise.resolve({} as Record<string, ChapterProgress>),
    needsDownloads
      ? getMangaDownloads(entry.sourceId, entry.mangaKey)
      : Promise.resolve([]),
  ]);

  if (needsUnread && keys.length > 0) {
    const readKeys = new Set(
      Object.values(progress)
        .filter((item) => item.page === -1)
        .map((item) => item.chapterKey),
    );
    entry.unreadCount = keys.filter((key) => !readKeys.has(key)).length;
    entry.chapterCount = new Set(keys).size;
  }

  if (needsDownloads) {
    entry.downloadedCount = downloads.filter(
      (item) => item.status === "completed",
    ).length;
  }

  if (entry.status === undefined && cached?.manga.status) {
    entry.status = cached.manga.status;
  }
  entry.lastReadAt = await getMangaLastRead(entry.sourceId, entry.mangaKey);
  return keys.length > 0 ? keys : undefined;
}

// Writes a brand-new entry together with its known chapter keys.
function persistNewEntry(
  state: LibraryState,
  entry: LibraryEntry,
  keys: string[] | undefined,
): Promise<void> {
  return commit(state, {
    entries: [entry],
    extra: keys
      ? async (tx) => {
          await replaceKnownChapters(tx, entry.sourceId, entry.mangaKey, keys);
        }
      : undefined,
  });
}

export async function addToLibrary(
  entry: Pick<LibraryEntry, "sourceId" | "mangaKey" | "title" | "cover">,
  categoryIds?: string[],
): Promise<void> {
  const store = await readStore();
  const key = entryKey(entry.sourceId, entry.mangaKey);
  const existing = store.entries.get(key);
  const normalizedCategories = (categoryIds ?? []).filter(
    (id) => !isAllCategory(id),
  );
  const fallbackCategories =
    normalizedCategories.length > 0
      ? normalizedCategories
      : isAllCategory(store.settings.defaultCategoryId)
        ? []
        : [store.settings.defaultCategoryId];

  if (existing) {
    existing.title = entry.title;
    existing.cover = entry.cover;
    for (const categoryId of fallbackCategories) {
      if (!existing.categoryIds.includes(categoryId)) {
        existing.categoryIds.push(categoryId);
      }
    }
    await commit(store, { entries: [existing] });
    return;
  }

  const nextEntry: LibraryEntry = {
    ...entry,
    categoryIds: fallbackCategories,
    dateAdded: Date.now(),
  };
  const keys = await applyEntryBadges(nextEntry);
  // The badges lookup is async; another call may have added the same manga meanwhile.
  if (store.entries.has(key)) return;
  store.entries.set(key, nextEntry);
  await persistNewEntry(store, nextEntry, keys);
}

export async function removeFromLibrary(
  sourceId: string,
  mangaKey: string,
): Promise<void> {
  const store = await readStore();
  if (!store.entries.delete(entryKey(sourceId, mangaKey))) return;
  await commit(store, { removed: [{ sourceId, mangaKey }] });
  await removeMangaDownloads(sourceId, mangaKey);
}

export async function replaceLibraryEntry(
  from: { sourceId: string; mangaKey: string },
  to: Pick<LibraryEntry, "sourceId" | "mangaKey" | "title" | "cover">,
): Promise<boolean> {
  const store = await readStore();
  const fromKey = entryKey(from.sourceId, from.mangaKey);
  const toKey = entryKey(to.sourceId, to.mangaKey);
  const source = store.entries.get(fromKey);
  if (!source) return false;

  const existing = fromKey === toKey ? undefined : store.entries.get(toKey);

  if (existing) {
    for (const categoryId of source.categoryIds) {
      if (!existing.categoryIds.includes(categoryId)) {
        existing.categoryIds.push(categoryId);
      }
    }
    existing.dateAdded = Math.min(existing.dateAdded, source.dateAdded);
    store.entries.delete(fromKey);
    await commit(store, {
      entries: [existing],
      removed: [{ sourceId: from.sourceId, mangaKey: from.mangaKey }],
    });
    return true;
  }

  // Same identity: only the display data changes. Otherwise the entry moves to the new identity and
  // forgets everything learned from the old source.
  const moved = fromKey !== toKey;
  if (moved) store.entries.delete(fromKey);
  source.sourceId = to.sourceId;
  source.mangaKey = to.mangaKey;
  source.title = to.title;
  source.cover = to.cover;
  source.chapterCount = 0;
  source.unreadCount = undefined;
  source.downloadedCount = undefined;
  source.status = undefined;
  source.updateFailed = false;
  source.lastRefreshed = undefined;
  source.lastAttemptAt = undefined;
  store.entries.set(toKey, source);
  await commit(store, {
    entries: [source],
    removed: moved
      ? [{ sourceId: from.sourceId, mangaKey: from.mangaKey }]
      : [],
    extra: moved
      ? undefined
      : async (tx) => {
          await tx.runAsync(
            "DELETE FROM known_chapters WHERE source_id = ? AND manga_key = ?",
            [to.sourceId, to.mangaKey],
          );
        },
  });
  return true;
}

export async function setLibraryCategories(
  sourceId: string,
  mangaKey: string,
  categoryIds: string[],
): Promise<void> {
  const store = await readStore();
  const entry = store.entries.get(entryKey(sourceId, mangaKey));
  if (!entry) return;
  entry.categoryIds = categoryIds.filter((id) => !isAllCategory(id));
  await commit(store, { entries: [entry] });
}

export async function getLibraryEntry(
  sourceId: string,
  mangaKey: string,
): Promise<LibraryEntry | undefined> {
  const store = await readStore();
  return store.entries.get(entryKey(sourceId, mangaKey));
}

export async function toggleMangaLibraryCategory(
  sourceId: string,
  mangaKey: string,
  categoryId: string,
  meta: Pick<LibraryEntry, "title" | "cover"> &
    EntryBadgeMeta,
): Promise<{ inLibrary: boolean; categoryIds: string[] }> {
  const store = await readStore();
  const key = entryKey(sourceId, mangaKey);
  const entry = store.entries.get(key);
  const isAll = isAllCategory(categoryId);

  if (!entry) {
    const created: LibraryEntry = {
      sourceId,
      mangaKey,
      title: meta.title,
      cover: meta.cover,
      categoryIds: isAll ? [] : [categoryId],
      dateAdded: Date.now(),
    };
    const keys = await applyEntryBadges(created, meta);
    if (store.entries.has(key)) {
      return { inLibrary: true, categoryIds: [...created.categoryIds] };
    }
    store.entries.set(key, created);
    await persistNewEntry(store, created, keys);
    return { inLibrary: true, categoryIds: [...created.categoryIds] };
  }

  const leave = async () => {
    store.entries.delete(key);
    await commit(store, { removed: [{ sourceId, mangaKey }] });
    await removeMangaDownloads(sourceId, mangaKey);
    return { inLibrary: false, categoryIds: [] as string[] };
  };

  if (isAll) {
    if (entry.categoryIds.length === 0) return leave();
    entry.categoryIds = [];
    entry.title = meta.title;
    entry.cover = meta.cover;
    await commit(store, { entries: [entry] });
    return { inLibrary: true, categoryIds: [] };
  }

  if (entry.categoryIds.includes(categoryId)) {
    entry.categoryIds = entry.categoryIds.filter((id) => id !== categoryId);
    if (entry.categoryIds.length === 0) return leave();
  } else {
    entry.categoryIds.push(categoryId);
    entry.title = meta.title;
    entry.cover = meta.cover;
  }

  await commit(store, { entries: [entry] });
  return { inLibrary: true, categoryIds: [...entry.categoryIds] };
}

export async function addMangaToLibraryWithCategories(
  sourceId: string,
  mangaKey: string,
  meta: Pick<LibraryEntry, "title" | "cover">,
  categoryIds: string[],
): Promise<{ inLibrary: boolean; categoryIds: string[] }> {
  const store = await readStore();
  const normalizedCategories = categoryIds.filter((id) => !isAllCategory(id));
  const fallbackCategories =
    normalizedCategories.length > 0
      ? normalizedCategories
      : isAllCategory(store.settings.defaultCategoryId)
        ? []
        : [store.settings.defaultCategoryId];

  await addToLibrary({ sourceId, mangaKey, ...meta }, fallbackCategories);
  const entry = await getLibraryEntry(sourceId, mangaKey);
  return {
    inLibrary: true,
    categoryIds: entry?.categoryIds ?? fallbackCategories,
  };
}

export async function getExcludedCategoryIds(): Promise<string[]> {
  const store = await readStore();
  return [...store.settings.excludedCategoryIds];
}

export async function isCategoryExcludedFromUpdates(
  categoryId: string,
): Promise<boolean> {
  if (isAllCategory(categoryId)) return false;
  const store = await readStore();
  return store.settings.excludedCategoryIds.includes(categoryId);
}

export async function setCategoryExcludedFromUpdates(
  categoryId: string,
  excluded: boolean,
): Promise<void> {
  if (isAllCategory(categoryId)) return;
  const store = await readStore();
  if (excluded) {
    if (!store.settings.excludedCategoryIds.includes(categoryId)) {
      store.settings.excludedCategoryIds.push(categoryId);
    }
  } else {
    store.settings.excludedCategoryIds =
      store.settings.excludedCategoryIds.filter((id) => id !== categoryId);
  }
  await commit(store, { settings: true });
}

export async function getUpdateOnWifiOnly(): Promise<boolean> {
  const store = await readStore();
  return store.settings.updateOnWifiOnly;
}

export async function setUpdateOnWifiOnly(value: boolean): Promise<void> {
  const store = await readStore();
  store.settings.updateOnWifiOnly = value;
  await commit(store, { settings: true });
}

type UpdateSettingKey =
  | "updateInterval"
  | "skipUnreadChapters"
  | "skipCompletedStatus"
  | "skipUnreadManga"
  | "refreshMetadata"
  | "backgroundRefresh"
  | "updateOnWifiOnly"
  | "lastAutoRefreshAt";

export async function getLibraryUpdateSettings(): Promise<
  Pick<LibrarySettings, UpdateSettingKey>
> {
  const { settings } = await readStore();
  return {
    updateInterval: settings.updateInterval,
    skipUnreadChapters: settings.skipUnreadChapters,
    skipCompletedStatus: settings.skipCompletedStatus,
    skipUnreadManga: settings.skipUnreadManga,
    refreshMetadata: settings.refreshMetadata,
    backgroundRefresh: settings.backgroundRefresh,
    updateOnWifiOnly: settings.updateOnWifiOnly,
    lastAutoRefreshAt: settings.lastAutoRefreshAt,
  };
}

export async function updateLibraryUpdateSettings(
  patch: Partial<Pick<LibrarySettings, UpdateSettingKey>>,
): Promise<void> {
  const store = await readStore();
  Object.assign(store.settings, patch);
  await commit(store, { settings: true });
  if ("backgroundRefresh" in patch || "updateInterval" in patch) {
    void import("@/services/background-library-update").then((module) =>
      module.syncBackgroundLibraryUpdates(),
    );
  }
}

/** Unread chapters of the library, or the number of manga with unread chapters when `countManga` is set. */
export async function getLibraryUnreadTotal(
  onlyUpdatable: boolean,
  countManga = false,
): Promise<number> {
  const store = await readStore();
  let total = 0;
  for (const entry of store.entries.values()) {
    const unread = entry.unreadCount ?? 0;
    if (unread <= 0) continue;
    if (
      onlyUpdatable &&
      entry.categoryIds.length > 0 &&
      !entry.categoryIds.some(
        (categoryId) => !store.settings.excludedCategoryIds.includes(categoryId),
      )
    ) {
      continue;
    }
    total += countManga ? 1 : unread;
  }
  return total;
}

export async function shouldRefreshLibraryEntry(
  entry: LibraryEntry,
): Promise<boolean> {
  const { settings } = await readStore();
  if (entry.categoryIds.length > 0) {
    const included = entry.categoryIds.some(
      (categoryId) => !settings.excludedCategoryIds.includes(categoryId),
    );
    if (!included) return false;
  }

  if (settings.skipUnreadChapters && (entry.unreadCount ?? 0) > 0) return false;
  if (settings.skipCompletedStatus && entry.status === "completed") return false;

  if (settings.skipUnreadManga) {
    const { hasReadingActivity } = await import("@/services/manga-tracking");
    if (!(await hasReadingActivity(entry.sourceId, entry.mangaKey))) return false;
  }

  return true;
}

export type LibraryEntryMetadata = Partial<
  Pick<
    LibraryEntry,
    | "title"
    | "cover"
    | "unreadCount"
    | "downloadedCount"
    | "lastRefreshed"
    | "status"
    | "updateFailed"
    | "lastAttemptAt"
    | "favorite"
  >
> & {
  /** Full chapter list in source order; stored in `known_chapters`, not on the entry. */
  knownChapterKeys?: string[];
};

const LAST_REFRESHED_MIN_STEP_MS = 10 * 60 * 1000;

// Applies scalar fields; returns whether the entry row changed. Chapter keys are handled by the caller.
function applyEntryMetadata(
  entry: LibraryEntry,
  metadata: LibraryEntryMetadata,
): boolean {
  let changed = false;
  if (metadata.title && entry.title !== metadata.title) {
    entry.title = metadata.title;
    changed = true;
  }
  if (metadata.cover !== undefined && entry.cover !== metadata.cover) {
    entry.cover = metadata.cover;
    changed = true;
  }
  if (
    metadata.unreadCount !== undefined &&
    entry.unreadCount !== metadata.unreadCount
  ) {
    entry.unreadCount = metadata.unreadCount;
    changed = true;
  }
  if (
    metadata.downloadedCount !== undefined &&
    entry.downloadedCount !== metadata.downloadedCount
  ) {
    entry.downloadedCount = metadata.downloadedCount;
    changed = true;
  }
  if (
    metadata.lastRefreshed !== undefined &&
    (entry.lastRefreshed === undefined ||
      Math.abs(metadata.lastRefreshed - entry.lastRefreshed) >=
        LAST_REFRESHED_MIN_STEP_MS)
  ) {
    entry.lastRefreshed = metadata.lastRefreshed;
    changed = true;
  }
  if (
    metadata.favorite !== undefined &&
    Boolean(entry.favorite) !== metadata.favorite
  ) {
    if (metadata.favorite) entry.favorite = true;
    else delete entry.favorite;
    changed = true;
  }
  if (metadata.status !== undefined && entry.status !== metadata.status) {
    entry.status = metadata.status;
    changed = true;
  }
  if (
    metadata.updateFailed !== undefined &&
    Boolean(entry.updateFailed) !== metadata.updateFailed
  ) {
    entry.updateFailed = metadata.updateFailed;
    changed = true;
  }
  if (
    metadata.lastAttemptAt !== undefined &&
    entry.lastAttemptAt !== metadata.lastAttemptAt
  ) {
    entry.lastAttemptAt = metadata.lastAttemptAt;
    changed = true;
  }
  return changed;
}

export async function setLibraryFavorite(
  sourceId: string,
  mangaKey: string,
  favorite: boolean,
): Promise<void> {
  await updateLibraryEntryMetadata(sourceId, mangaKey, { favorite });
}

export async function updateLibraryEntryMetadata(
  sourceId: string,
  mangaKey: string,
  metadata: LibraryEntryMetadata,
): Promise<void> {
  await updateLibraryEntriesMetadata([{ sourceId, mangaKey, metadata }]);
}

export async function updateLibraryEntriesMetadata(
  updates: Array<{
    sourceId: string;
    mangaKey: string;
    metadata: LibraryEntryMetadata;
  }>,
): Promise<void> {
  if (updates.length === 0) return;
  const store = await readStore();
  const changedRows = new Map<string, LibraryEntry>();
  const chapterLists: Array<{ entry: LibraryEntry; keys: string[] }> = [];

  for (const update of updates) {
    const entry = store.entries.get(entryKey(update.sourceId, update.mangaKey));
    if (!entry) continue;
    if (applyEntryMetadata(entry, update.metadata)) {
      changedRows.set(entryKey(entry.sourceId, entry.mangaKey), entry);
    }
    if (update.metadata.knownChapterKeys !== undefined) {
      chapterLists.push({ entry, keys: update.metadata.knownChapterKeys });
    }
  }
  if (changedRows.size === 0 && chapterLists.length === 0) return;

  const counts = new Map<LibraryEntry, number>();
  notifyMangaDataChanged();
  await runWrite(async (tx) => {
    for (const { entry, keys } of chapterLists) {
      const count = await replaceKnownChapters(
        tx,
        entry.sourceId,
        entry.mangaKey,
        keys,
      );
      counts.set(entry, count);
    }
    for (const [entry, count] of counts) {
      if ((entry.chapterCount ?? 0) !== count) {
        entry.chapterCount = count;
        changedRows.set(entryKey(entry.sourceId, entry.mangaKey), entry);
      }
    }
    for (const entry of changedRows.values()) await writeEntryRow(tx, entry);
  });
}

/** Chapter keys of a library manga in source order (empty when none are known yet). */
export async function getKnownChapterKeys(
  sourceId: string,
  mangaKey: string,
): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ chapter_key: string }>(
    "SELECT chapter_key FROM known_chapters WHERE source_id = ? AND manga_key = ? ORDER BY position",
    [sourceId, mangaKey],
  );
  return rows.map((row) => row.chapter_key);
}

/** Known chapter keys of an entry, falling back to the cached detail page of the manga. */
export async function chapterKeysForLibraryEntry(
  entry: Pick<LibraryEntry, "sourceId" | "mangaKey" | "chapterCount">,
): Promise<string[]> {
  if (entry.chapterCount) {
    const keys = await getKnownChapterKeys(entry.sourceId, entry.mangaKey);
    if (keys.length > 0) return keys;
  }
  return (
    peekMangaDetailCache(entry.sourceId, entry.mangaKey)?.manga.chapters?.map(
      (chapter) => chapter.key,
    ) ?? []
  );
}

/**
 * Recomputes the unread badge of a library manga from its known chapters and reading progress in one
 * query. When a fresh chapter list is passed (or the detail cache has a longer one) it becomes the
 * known list first.
 */
export async function syncLibraryEntryUnread(
  sourceId: string,
  mangaKey: string,
  chapters?: { key: string }[],
): Promise<void> {
  const store = await readStore();
  const entry = store.entries.get(entryKey(sourceId, mangaKey));
  if (!entry) return;

  const candidate =
    chapters?.map((chapter) => chapter.key) ??
    peekMangaDetailCache(sourceId, mangaKey)?.manga.chapters?.map(
      (chapter) => chapter.key,
    ) ??
    [];

  const result = await runWrite(async (tx) => {
    const lastRead = (await getMangaLastRead(sourceId, mangaKey, tx)) ?? null;
    let count = entry.chapterCount ?? 0;
    if (candidate.length > 0 && candidate.length >= count) {
      count = await replaceKnownChapters(tx, sourceId, mangaKey, candidate);
    }
    const unread = count > 0 ? await countUnreadChapters(sourceId, mangaKey, tx) : null;
    await tx.runAsync(
      `UPDATE library_entries SET last_read_at = ?, unread_count = COALESCE(?, unread_count), chapter_count = ?
       WHERE source_id = ? AND manga_key = ?`,
      [lastRead, unread, count, sourceId, mangaKey],
    );
    return { unread, count, lastRead };
  });
  let changed = false;
  if (result.unread !== null && entry.unreadCount !== result.unread) {
    entry.unreadCount = result.unread;
    changed = true;
  }
  if (entry.chapterCount !== result.count) {
    entry.chapterCount = result.count;
    changed = true;
  }
  if (entry.lastReadAt !== (result.lastRead ?? undefined)) {
    entry.lastReadAt = result.lastRead ?? undefined;
    changed = true;
  }
  if (changed) notifyMangaDataChanged();
}

/** Recomputes unread badges and last-read times in a few statements (after bulk history removal or restores). */
export async function recomputeAllLibraryUnread(): Promise<void> {
  const store = await readStore();
  const rows = await runWrite(async (tx) => {
    await tx.runAsync(
      `UPDATE library_entries SET unread_count = (
         SELECT COUNT(*) FROM known_chapters k
         WHERE k.source_id = library_entries.source_id AND k.manga_key = library_entries.manga_key
           AND NOT EXISTS (
             SELECT 1 FROM reading_log r
             WHERE r.source_id = k.source_id AND r.manga_key = k.manga_key
               AND r.chapter_key = k.chapter_key AND r.page = -1))
       WHERE chapter_count > 0`,
    );
    await tx.runAsync(REFRESH_LAST_READ_SQL);
    return tx.getAllAsync<{
      source_id: string;
      manga_key: string;
      unread_count: number | null;
      last_read_at: number | null;
    }>(
      "SELECT source_id, manga_key, unread_count, last_read_at FROM library_entries",
    );
  });
  for (const row of rows) {
    const entry = store.entries.get(entryKey(row.source_id, row.manga_key));
    if (!entry) continue;
    if (entry.chapterCount) entry.unreadCount = row.unread_count ?? undefined;
    entry.lastReadAt = row.last_read_at ?? undefined;
  }
  notifyMangaDataChanged();
}

/** Deletes the whole library (entries, categories, chapter keys, library settings). */
export async function resetLibrary(): Promise<void> {
  await runWrite(async (tx) => {
    for (const table of [
      "library_entries",
      "library_entry_categories",
      "known_chapters",
      "categories",
    ]) {
      await tx.runAsync(`DELETE FROM ${table}`);
    }
  });
  await removeValue(LIBRARY_SETTINGS_KEY);
  invalidateLibraryCache();
  notifyMangaDataChanged();
}

export const LIBRARY_UPDATE_INTERVAL_MS: Record<
  LibraryUpdateInterval,
  number | null
> = {
  never: null,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "48h": 48 * 60 * 60 * 1000,
};
