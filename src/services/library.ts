import { getValue, setValue, storageKeys } from '@/constants/storage';
import { peekMangaDetailCache } from '@/services/manga-detail-cache';
import { getDownloads, getMangaDownloads, removeMangaDownloads } from '@/services/downloads';
import { getMangaChapterProgress, type ChapterProgress } from '@/services/manga-tracking';
import { notifyMangaDataChanged } from '@/utils/manga-events';
import type { LibrarySortMode } from '@/services/app-settings';

export const ALL_CATEGORY_ID = 'all';

export type LibraryCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export type LibraryUpdateInterval = 'never' | '1h' | '6h' | '12h' | '24h' | '48h';

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
  status?: 'unknown' | 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
  knownChapterKeys?: string[];
  updateFailed?: boolean;
};

export type LibraryStore = {
  categories: LibraryCategory[];
  entries: LibraryEntry[];
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

const DEFAULT_CATEGORIES: LibraryCategory[] = [{ id: ALL_CATEGORY_ID, name: 'All', sortOrder: 0 }];

function entryKey(sourceId: string, mangaKey: string): string {
  return `${sourceId}:${mangaKey}`;
}

export function chapterKeysForLibraryEntry(entry: LibraryEntry): string[] {
  if (entry.knownChapterKeys?.length) return entry.knownChapterKeys;
  return peekMangaDetailCache(entry.sourceId, entry.mangaKey)?.manga.chapters?.map((chapter) => chapter.key) ?? [];
}

export function resolveLibraryUnreadCount(
  entry: Pick<LibraryEntry, 'sourceId' | 'mangaKey' | 'unreadCount' | 'knownChapterKeys'>,
  readKeys?: Set<string>,
): number {
  const cachedKeys =
    peekMangaDetailCache(entry.sourceId, entry.mangaKey)?.manga.chapters?.map((chapter) => chapter.key) ?? [];
  const known = entry.knownChapterKeys ?? [];
  const keys = cachedKeys.length >= known.length ? cachedKeys : known;
  if (keys.length === 0) return entry.unreadCount ?? 0;
  if (!readKeys) return entry.unreadCount ?? keys.length;
  return keys.filter((key) => !readKeys.has(key)).length;
}

export async function syncLibraryEntryUnread(
  sourceId: string,
  mangaKey: string,
  chapters?: { key: string }[],
): Promise<void> {
  const entry = await getLibraryEntry(sourceId, mangaKey);
  if (!entry) return;

  const progress = await getMangaChapterProgress(sourceId, mangaKey);
  const readKeys = new Set(
    Object.values(progress)
      .filter((item) => item.page === -1)
      .map((item) => item.chapterKey),
  );
  const cachedKeys =
    chapters?.map((chapter) => chapter.key) ??
    peekMangaDetailCache(sourceId, mangaKey)?.manga.chapters?.map((chapter) => chapter.key) ??
    [];
  const known = entry.knownChapterKeys ?? [];
  const keys = cachedKeys.length >= known.length ? cachedKeys : known;
  if (keys.length === 0) return;

  const unreadCount = keys.filter((key) => !readKeys.has(key)).length;
  const keysChanged = keys.length !== known.length || keys.some((key, index) => known[index] !== key);
  if (entry.unreadCount === unreadCount && !keysChanged) return;

  await updateLibraryEntryMetadata(sourceId, mangaKey, {
    unreadCount,
    knownChapterKeys: keys,
  });
}

export const LIBRARY_SORT_MODES: LibrarySortMode[] = ['unread', 'title', 'recent', 'lastRead'];

function titleSortKey(title: string): string {
  return title.trim().toLocaleLowerCase();
}

export function sortLibraryEntries(
  entries: LibraryEntry[],
  sortMode: LibrarySortMode,
  lastReadAt: Map<string, number> = new Map(),
): LibraryEntry[] {
  const next = [...entries];
  next.sort((a, b) => {
    switch (sortMode) {
      case 'title':
        return titleSortKey(a.title).localeCompare(titleSortKey(b.title), undefined, { numeric: true, sensitivity: 'base' });
      case 'recent':
        return b.dateAdded - a.dateAdded;
      case 'lastRead': {
        const aRead = lastReadAt.get(entryKey(a.sourceId, a.mangaKey)) ?? 0;
        const bRead = lastReadAt.get(entryKey(b.sourceId, b.mangaKey)) ?? 0;
        if (aRead !== bRead) return bRead - aRead;
        return titleSortKey(a.title).localeCompare(titleSortKey(b.title), undefined, { numeric: true, sensitivity: 'base' });
      }
      case 'unread':
      default: {
        const unreadDiff = (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
        if (unreadDiff !== 0) return unreadDiff;
        return titleSortKey(a.title).localeCompare(titleSortKey(b.title), undefined, { numeric: true, sensitivity: 'base' });
      }
    }
  });
  return next;
}

async function applyEntryBadges(
  entry: LibraryEntry,
  meta?: Partial<Pick<LibraryEntry, 'unreadCount' | 'downloadedCount' | 'knownChapterKeys' | 'status'>>,
): Promise<void> {
  if (meta?.unreadCount !== undefined) entry.unreadCount = meta.unreadCount;
  if (meta?.downloadedCount !== undefined) entry.downloadedCount = meta.downloadedCount;
  if (meta?.knownChapterKeys !== undefined) entry.knownChapterKeys = meta.knownChapterKeys;
  if (meta?.status !== undefined) entry.status = meta.status;

  const cached = peekMangaDetailCache(entry.sourceId, entry.mangaKey);
  const chapters = cached?.manga.chapters ?? [];
  const cachedKeys = chapters.map((chapter) => chapter.key);
  const known = entry.knownChapterKeys ?? [];
  const needsUnread =
    entry.unreadCount === undefined || (cachedKeys.length > 0 && cachedKeys.length !== known.length);
  const needsDownloads = entry.downloadedCount === undefined;
  if (!needsUnread && !needsDownloads) return;

  const [progress, downloads] = await Promise.all([
    needsUnread ? getMangaChapterProgress(entry.sourceId, entry.mangaKey) : Promise.resolve({} as Record<string, ChapterProgress>),
    needsDownloads ? getMangaDownloads(entry.sourceId, entry.mangaKey) : Promise.resolve([]),
  ]);

  if (needsUnread && cachedKeys.length > 0) {
    const readKeys = new Set(
      Object.values(progress)
        .filter((item) => item.page === -1)
        .map((item) => item.chapterKey),
    );
    entry.unreadCount = cachedKeys.filter((key) => !readKeys.has(key)).length;
    entry.knownChapterKeys = cachedKeys;
  }

  if (needsDownloads) {
    entry.downloadedCount = downloads.filter((item) => item.status === 'completed').length;
  }

  if (entry.status === undefined && cached?.manga.status) {
    entry.status = cached.manga.status;
  }
}

function defaultStore(): LibraryStore {
  return {
    categories: DEFAULT_CATEGORIES,
    entries: [],
    currentCategoryId: ALL_CATEGORY_ID,
    defaultCategoryId: ALL_CATEGORY_ID,
    excludedCategoryIds: [],
    updateOnWifiOnly: false,
    updateInterval: '12h',
    skipUnreadChapters: false,
    skipCompletedStatus: false,
    skipUnreadManga: false,
    refreshMetadata: true,
    backgroundRefresh: false,
  };
}

function normalizeCategories(categories: LibraryCategory[], defaultCategoryId: string): LibraryCategory[] {
  const allCategory: LibraryCategory = { id: ALL_CATEGORY_ID, name: 'All', sortOrder: 0 };
  const userCategories = categories.filter((category) => category.id !== ALL_CATEGORY_ID);

  if (defaultCategoryId === ALL_CATEGORY_ID) {
    return [allCategory, ...userCategories.map((category, index) => ({ ...category, sortOrder: index + 1 }))];
  }

  if (!categories.some((category) => category.id === ALL_CATEGORY_ID)) {
    return [allCategory, ...userCategories.map((category, index) => ({ ...category, sortOrder: index + 1 }))];
  }

  return categories.map((category, index) => ({ ...category, sortOrder: index }));
}

let memoryStore: LibraryStore | null = null;

export function invalidateLibraryCache(): void {
  memoryStore = null;
}

async function readStore(): Promise<LibraryStore> {
  if (memoryStore) return memoryStore;

  const stored = await getValue<LibraryStore | null>(storageKeys.LIBRARY, null);
  if (!stored) {
    memoryStore = defaultStore();
    return memoryStore;
  }

  const merged = {
    ...defaultStore(),
    ...stored,
    categories: stored.categories?.length ? stored.categories : DEFAULT_CATEGORIES,
    excludedCategoryIds: stored.excludedCategoryIds ?? [],
    updateOnWifiOnly: stored.updateOnWifiOnly ?? false,
    updateInterval: stored.updateInterval ?? '12h',
    skipUnreadChapters: stored.skipUnreadChapters ?? false,
    skipCompletedStatus: stored.skipCompletedStatus ?? false,
    skipUnreadManga: stored.skipUnreadManga ?? false,
    refreshMetadata: stored.refreshMetadata ?? true,
    backgroundRefresh: stored.backgroundRefresh ?? false,
    lastAutoRefreshAt: stored.lastAutoRefreshAt,
  };
  merged.categories = normalizeCategories(merged.categories, merged.defaultCategoryId);
  memoryStore = merged;
  return memoryStore;
}

async function writeStore(store: LibraryStore): Promise<void> {
  store.categories = normalizeCategories(store.categories, store.defaultCategoryId);
  memoryStore = {
    ...store,
    categories: store.categories.map((category) => ({ ...category })),
    entries: store.entries.map((entry) => ({ ...entry, categoryIds: [...entry.categoryIds] })),
  };
  notifyMangaDataChanged();
  await setValue(storageKeys.LIBRARY, memoryStore);
}

export function isAllCategory(categoryId: string): boolean {
  return categoryId === ALL_CATEGORY_ID;
}

export function libraryCategoryCount(entries: LibraryEntry[], categoryId: string): number {
  if (isAllCategory(categoryId)) return entries.length;
  return entries.filter((entry) => entry.categoryIds.includes(categoryId)).length;
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
  return store.currentCategoryId;
}

export async function setCurrentCategoryId(categoryId: string): Promise<void> {
  const store = await readStore();
  store.currentCategoryId = categoryId;
  await writeStore(store);
}

export async function getDefaultCategoryId(): Promise<string> {
  const store = await readStore();
  return store.defaultCategoryId;
}

export async function setDefaultCategoryId(categoryId: string): Promise<void> {
  const store = await readStore();
  store.defaultCategoryId = categoryId;
  store.currentCategoryId = categoryId;
  await writeStore(store);
}

export async function addLibraryCategory(name: string): Promise<LibraryCategory> {
  const store = await readStore();
  const category: LibraryCategory = {
    id: `cat_${Date.now()}`,
    name,
    sortOrder: store.categories.length,
  };
  store.categories.push(category);
  await writeStore(store);
  return category;
}

export async function renameLibraryCategory(categoryId: string, name: string): Promise<void> {
  if (isAllCategory(categoryId)) return;
  const store = await readStore();
  const category = store.categories.find((item) => item.id === categoryId);
  if (!category) return;
  category.name = name;
  await writeStore(store);
}

export async function removeLibraryCategory(categoryId: string): Promise<void> {
  if (isAllCategory(categoryId)) return;
  const store = await readStore();
  store.categories = store.categories.filter((item) => item.id !== categoryId);
  for (const entry of store.entries) {
    entry.categoryIds = entry.categoryIds.filter((id) => id !== categoryId);
  }
  if (store.currentCategoryId === categoryId) {
    store.currentCategoryId = ALL_CATEGORY_ID;
  }
  if (store.defaultCategoryId === categoryId) {
    store.defaultCategoryId = ALL_CATEGORY_ID;
  }
  await writeStore(store);
}

export async function reorderLibraryCategories(orderedIds: string[]): Promise<void> {
  const store = await readStore();
  const byId = new Map(store.categories.map((category) => [category.id, category]));
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
  store.categories = reordered.map((category, index) => ({ ...category, sortOrder: index }));
  await writeStore(store);
}

export async function getLibraryEntries(categoryId?: string): Promise<LibraryEntry[]> {
  const store = await readStore();
  const entries = [...store.entries].sort((a, b) => b.dateAdded - a.dateAdded);
  const downloads = await getDownloads();
  const downloadCounts = new Map<string, number>();
  for (const item of downloads) {
    if (item.status !== 'completed') continue;
    const key = entryKey(item.sourceId, item.mangaKey);
    downloadCounts.set(key, (downloadCounts.get(key) ?? 0) + 1);
  }
  const withCounts = entries.map((entry) => ({
    ...entry,
    downloadedCount: downloadCounts.get(entryKey(entry.sourceId, entry.mangaKey)) ?? 0,
  }));
  if (!categoryId || isAllCategory(categoryId)) return withCounts;
  return withCounts.filter((entry) => entry.categoryIds.includes(categoryId));
}

export async function isInLibrary(sourceId: string, mangaKey: string): Promise<boolean> {
  const store = await readStore();
  return store.entries.some((entry) => entryKey(entry.sourceId, entry.mangaKey) === entryKey(sourceId, mangaKey));
}

export async function addToLibrary(
  entry: Pick<LibraryEntry, 'sourceId' | 'mangaKey' | 'title' | 'cover'>,
  categoryIds?: string[],
): Promise<void> {
  const store = await readStore();
  const key = entryKey(entry.sourceId, entry.mangaKey);
  const existing = store.entries.find((item) => entryKey(item.sourceId, item.mangaKey) === key);
  const normalizedCategories = (categoryIds ?? []).filter((id) => !isAllCategory(id));
  const fallbackCategories =
    normalizedCategories.length > 0
      ? normalizedCategories
      : isAllCategory(store.defaultCategoryId)
        ? []
        : [store.defaultCategoryId];

  if (existing) {
    existing.title = entry.title;
    existing.cover = entry.cover;
    for (const categoryId of fallbackCategories) {
      if (!existing.categoryIds.includes(categoryId)) {
        existing.categoryIds.push(categoryId);
      }
    }
  } else {
    const nextEntry: LibraryEntry = {
      ...entry,
      categoryIds: fallbackCategories,
      dateAdded: Date.now(),
    };
    await applyEntryBadges(nextEntry);
    store.entries.push(nextEntry);
  }

  await writeStore(store);
}

export async function removeFromLibrary(sourceId: string, mangaKey: string): Promise<void> {
  const store = await readStore();
  const key = entryKey(sourceId, mangaKey);
  store.entries = store.entries.filter((entry) => entryKey(entry.sourceId, entry.mangaKey) !== key);
  await writeStore(store);
  await removeMangaDownloads(sourceId, mangaKey);
}

export async function setLibraryCategories(
  sourceId: string,
  mangaKey: string,
  categoryIds: string[],
): Promise<void> {
  const store = await readStore();
  const key = entryKey(sourceId, mangaKey);
  const entry = store.entries.find((item) => entryKey(item.sourceId, item.mangaKey) === key);
  if (!entry) return;
  entry.categoryIds = categoryIds.filter((id) => !isAllCategory(id));
  await writeStore(store);
}

export async function getLibraryEntry(sourceId: string, mangaKey: string): Promise<LibraryEntry | undefined> {
  const store = await readStore();
  return store.entries.find((entry) => entryKey(entry.sourceId, entry.mangaKey) === entryKey(sourceId, mangaKey));
}

export async function toggleMangaLibraryCategory(
  sourceId: string,
  mangaKey: string,
  categoryId: string,
  meta: Pick<LibraryEntry, 'title' | 'cover'> &
    Partial<Pick<LibraryEntry, 'unreadCount' | 'downloadedCount' | 'knownChapterKeys' | 'status'>>,
): Promise<{ inLibrary: boolean; categoryIds: string[] }> {
  if (isAllCategory(categoryId)) {
    const store = await readStore();
    const key = entryKey(sourceId, mangaKey);
    let entry = store.entries.find((item) => entryKey(item.sourceId, item.mangaKey) === key);

    if (!entry) {
      entry = {
        sourceId,
        mangaKey,
        title: meta.title,
        cover: meta.cover,
        categoryIds: [],
        dateAdded: Date.now(),
      };
      await applyEntryBadges(entry, meta);
      store.entries.push(entry);
      await writeStore(store);
      return { inLibrary: true, categoryIds: [] };
    }

    if (entry.categoryIds.length === 0) {
      store.entries = store.entries.filter((item) => entryKey(item.sourceId, item.mangaKey) !== key);
      await writeStore(store);
      await removeMangaDownloads(sourceId, mangaKey);
      return { inLibrary: false, categoryIds: [] };
    }

    entry.categoryIds = [];
    entry.title = meta.title;
    entry.cover = meta.cover;
    await writeStore(store);
    return { inLibrary: true, categoryIds: [] };
  }

  const store = await readStore();
  const key = entryKey(sourceId, mangaKey);
  let entry = store.entries.find((item) => entryKey(item.sourceId, item.mangaKey) === key);

  if (!entry) {
    entry = {
      sourceId,
      mangaKey,
      title: meta.title,
      cover: meta.cover,
      categoryIds: [categoryId],
      dateAdded: Date.now(),
    };
    await applyEntryBadges(entry, meta);
    store.entries.push(entry);
    await writeStore(store);
    return { inLibrary: true, categoryIds: [...entry.categoryIds] };
  }

  if (entry.categoryIds.includes(categoryId)) {
    entry.categoryIds = entry.categoryIds.filter((id) => id !== categoryId);
    if (entry.categoryIds.length === 0) {
      store.entries = store.entries.filter((item) => entryKey(item.sourceId, item.mangaKey) !== key);
      await writeStore(store);
      await removeMangaDownloads(sourceId, mangaKey);
      return { inLibrary: false, categoryIds: [] };
    }
  } else {
    entry.categoryIds.push(categoryId);
    entry.title = meta.title;
    entry.cover = meta.cover;
  }

  await writeStore(store);
  return { inLibrary: true, categoryIds: [...entry.categoryIds] };
}

export async function addMangaToLibraryWithCategories(
  sourceId: string,
  mangaKey: string,
  meta: Pick<LibraryEntry, 'title' | 'cover'>,
  categoryIds: string[],
): Promise<{ inLibrary: boolean; categoryIds: string[] }> {
  const store = await readStore();
  const normalizedCategories = categoryIds.filter((id) => !isAllCategory(id));
  const fallbackCategories =
    normalizedCategories.length > 0
      ? normalizedCategories
      : isAllCategory(store.defaultCategoryId)
        ? []
        : [store.defaultCategoryId];

  await addToLibrary({ sourceId, mangaKey, ...meta }, fallbackCategories);
  const entry = await getLibraryEntry(sourceId, mangaKey);
  return { inLibrary: true, categoryIds: entry?.categoryIds ?? fallbackCategories };
}

export async function getExcludedCategoryIds(): Promise<string[]> {
  const store = await readStore();
  return [...store.excludedCategoryIds];
}

export async function isCategoryExcludedFromUpdates(categoryId: string): Promise<boolean> {
  if (isAllCategory(categoryId)) return false;
  const store = await readStore();
  return store.excludedCategoryIds.includes(categoryId);
}

export async function setCategoryExcludedFromUpdates(categoryId: string, excluded: boolean): Promise<void> {
  if (isAllCategory(categoryId)) return;
  const store = await readStore();
  if (excluded) {
    if (!store.excludedCategoryIds.includes(categoryId)) {
      store.excludedCategoryIds.push(categoryId);
    }
  } else {
    store.excludedCategoryIds = store.excludedCategoryIds.filter((id) => id !== categoryId);
  }
  await writeStore(store);
}

export async function getUpdateOnWifiOnly(): Promise<boolean> {
  const store = await readStore();
  return store.updateOnWifiOnly;
}

export async function setUpdateOnWifiOnly(value: boolean): Promise<void> {
  const store = await readStore();
  store.updateOnWifiOnly = value;
  await writeStore(store);
}

export async function getLibraryUpdateSettings(): Promise<
  Pick<
    LibraryStore,
    | 'updateInterval'
    | 'skipUnreadChapters'
    | 'skipCompletedStatus'
    | 'skipUnreadManga'
    | 'refreshMetadata'
    | 'backgroundRefresh'
    | 'updateOnWifiOnly'
    | 'lastAutoRefreshAt'
  >
> {
  const store = await readStore();
  return {
    updateInterval: store.updateInterval,
    skipUnreadChapters: store.skipUnreadChapters,
    skipCompletedStatus: store.skipCompletedStatus,
    skipUnreadManga: store.skipUnreadManga,
    refreshMetadata: store.refreshMetadata,
    backgroundRefresh: store.backgroundRefresh,
    updateOnWifiOnly: store.updateOnWifiOnly,
    lastAutoRefreshAt: store.lastAutoRefreshAt,
  };
}

export async function updateLibraryUpdateSettings(
  patch: Partial<
    Pick<
      LibraryStore,
      | 'updateInterval'
      | 'skipUnreadChapters'
      | 'skipCompletedStatus'
      | 'skipUnreadManga'
      | 'refreshMetadata'
      | 'backgroundRefresh'
      | 'updateOnWifiOnly'
      | 'lastAutoRefreshAt'
    >
  >,
): Promise<void> {
  const store = await readStore();
  Object.assign(store, patch);
  await writeStore(store);
}

export async function shouldRefreshLibraryEntry(entry: LibraryEntry): Promise<boolean> {
  const store = await readStore();
  if (entry.categoryIds.length > 0) {
    const included = entry.categoryIds.some((categoryId) => !store.excludedCategoryIds.includes(categoryId));
    if (!included) return false;
  }

  if (store.skipUnreadChapters && (entry.unreadCount ?? 0) > 0) return false;
  if (store.skipCompletedStatus && entry.status === 'completed') return false;

  if (store.skipUnreadManga) {
    const { getMangaChapterProgress, getMangaHistoryForEntry } = await import('@/services/manga-tracking');
    const [progress, history] = await Promise.all([
      getMangaChapterProgress(entry.sourceId, entry.mangaKey),
      getMangaHistoryForEntry(entry.sourceId, entry.mangaKey),
    ]);
    const hasRead = Object.values(progress).some((item) => item.page === -1) || history.length > 0;
    if (!hasRead) return false;
  }

  return true;
}

export async function updateLibraryEntryMetadata(
  sourceId: string,
  mangaKey: string,
  metadata: Partial<
    Pick<
      LibraryEntry,
      | 'title'
      | 'cover'
      | 'unreadCount'
      | 'downloadedCount'
      | 'lastRefreshed'
      | 'status'
      | 'knownChapterKeys'
      | 'updateFailed'
    >
  >,
): Promise<void> {
  const store = await readStore();
  const key = entryKey(sourceId, mangaKey);
  const entry = store.entries.find((item) => entryKey(item.sourceId, item.mangaKey) === key);
  if (!entry) return;
  if (metadata.title) entry.title = metadata.title;
  if (metadata.cover !== undefined) entry.cover = metadata.cover;
  if (metadata.unreadCount !== undefined) entry.unreadCount = metadata.unreadCount;
  if (metadata.downloadedCount !== undefined) entry.downloadedCount = metadata.downloadedCount;
  if (metadata.lastRefreshed !== undefined) entry.lastRefreshed = metadata.lastRefreshed;
  if (metadata.status !== undefined) entry.status = metadata.status;
  if (metadata.knownChapterKeys !== undefined) entry.knownChapterKeys = metadata.knownChapterKeys;
  if (metadata.updateFailed !== undefined) entry.updateFailed = metadata.updateFailed;
  await writeStore(store);
}

export const LIBRARY_UPDATE_INTERVAL_MS: Record<LibraryUpdateInterval, number | null> = {
  never: null,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '48h': 48 * 60 * 60 * 1000,
};
