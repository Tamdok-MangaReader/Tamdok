import { Stack, useRouter } from "expo-router";
import { DEMO_LIBRARY_ENTRIES } from "@/services/demo-library";
import {
  isIllustrationMode,
  useIllustrationMode,
} from "@/services/illustration-mode";
import * as Haptics from "expo-haptics";
import {
  memo,
  useCallback,
  useEffect,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";
import PagerView from "react-native-pager-view";

import { LibraryCategoryTabs } from "@/components/library/library-category-tabs";
import {
  LibraryList,
  type LibraryListItem,
} from "@/components/library/library-list";
import {
  LibraryOptionsSheet,
  type LibrarySourceOption,
} from "@/components/library/library-options-sheet";
import {
  LibrarySummarySheet,
  type LibrarySummaryItem,
} from "@/components/library/library-summary-sheet";
import {
  AndroidPopupMenu,
  type AndroidPopupItem,
} from "@/components/ui/android-popup-menu";
import { useSearchBarReset } from "@/hooks/use-search-bar-reset";
import { useNavigationTheme } from "@/hooks/use-navigation-theme";
import { LibraryCategoryPicker } from "@/components/library/library-category-picker";
import { processQueuedDownloads } from "@/services/download-processor";
import {
  queueChapterDownloads,
  removeMangaDownloads,
} from "@/services/downloads";
import type { Manga } from "@/parsers/shared/types";
import {
  peekMangaDetailCache,
  readMangaDetailCache,
} from "@/services/manga-detail-cache";
import { chaptersOldestFirst, formatChapterLabel } from "@/utils/chapter-label";
import { type MangaGridItem } from "@/components/manga/manga-grid";
import { VirtualMangaGrid } from "@/components/manga/virtual-manga-grid";
import { usePinnedTabs } from "@/components/library/pinned-tabs";
import { LiquidGlassScrollComponent } from "@/components/ui/liquid-glass-scroll-root";
import { usePagerHeights } from "@/hooks/use-pager-heights";
import { IncognitoModeBanner } from "@/components/settings/incognito-mode-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { MangaGridSkeleton } from "@/components/ui/skeleton";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ScreenContent } from "@/components/ui/screen-content";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { maybeAskForReview } from "@/services/review-prompt";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/ui/glass-surface";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSources } from "@/context/sources-context";
import { useMangaDataRefresh } from "@/hooks/use-manga-data";
import { usePageScrollHandler } from "@/hooks/use-page-scroll-handler";
import { useTheme } from "@/hooks/use-theme";
import {
  refreshLibraryEntries,
  type LibraryRefreshProgress,
} from "@/services/library-refresh";
import { subscribeLibraryRefreshProgress } from "@/services/library-refresh-progress";
import {
  ALL_CATEGORY_ID,
  chapterKeysForLibraryEntry,
  filterLibraryEntries,
  getCurrentCategoryId,
  getLibraryCategories,
  getLibraryEntries,
  hasActiveLibraryFilters,
  hasCustomLibraryCategories,
  isAllCategory,
  libraryCategoryCount,
  removeFromLibrary,
  resolveLibraryUnreadCount,
  setCurrentCategoryId,
  setLibraryCategories,
  sortLibraryEntries,
  updateLibraryEntryMetadata,
  type LibraryCategory,
  type LibraryEntry,
} from "@/services/library";
import {
  DEFAULT_LIBRARY_FILTERS,
  getAppSettings,
  libraryDisplayColumns,
  updateAppSettings,
  type LibraryCategorySort,
  type LibraryDisplayMode,
  type LibraryFilters,
  type LibrarySortMode,
} from "@/services/app-settings";
import {
  getMangaChapterProgress,
  markAllChaptersRead,
  markAllChaptersUnread,
} from "@/services/manga-tracking";
import { subscribeAppSettings } from "@/utils/app-settings-events";
import { markStartupReady } from "@/utils/startup-gate";
import { findInstalledSource, sourceRouteId } from "@/services/sources";
import { mangaHref } from "@/utils/manga-route";

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

type LibraryMenuItem = Omit<AndroidPopupItem, "children"> & {
  sf: string;
  children?: LibraryMenuItem[];
};

const EMPTY_ENTRIES: LibraryListItem[] = [];
const EMPTY_LIST_ITEMS: LibraryListItem[] = [];

function categoryLabel(id: string, name: string): string {
  if (isAllCategory(id)) return t("library_category_all");
  return name;
}

function EmptyBelowTabs() {
  return (
    <View style={styles.emptyBelowTabs}>
      <EmptyState
        icon="library-outline"
        title={t("library_empty_title")}
        description={t("library_empty_desc")}
      />
    </View>
  );
}

type LibraryPageProps = {
  entries: LibraryListItem[];
  columns: number;
  displayMode: LibraryDisplayMode;
  pageId: string;
  empty?: ReactNode;
  onHeight: (pageId: string, height: number) => void;
  onPressManga: (manga: MangaGridItem) => void;
  /** Set only in selection mode; otherwise the cover context menu handles long press. */
  onLongPressManga?: (manga: MangaGridItem) => void;
  onSelectManga?: (manga: MangaGridItem) => void;
};

const EMPTY_BELOW_TABS = <EmptyBelowTabs />;

const LibraryPage = memo(function LibraryPage({
  entries,
  columns,
  displayMode,
  pageId,
  empty = EMPTY_BELOW_TABS,
  onHeight,
  onPressManga,
  onLongPressManga,
  onSelectManga,
}: LibraryPageProps) {
  return (
    <View collapsable={false} style={styles.root}>
      {displayMode === "grid" ? (
        <VirtualMangaGrid
          entries={entries}
          columns={columns}
          pageId={pageId}
          onHeight={onHeight}
          showBookmark={false}
          scaleBadges
          empty={empty}
          onPressManga={onPressManga}
          onLongPressManga={onLongPressManga}
          onSelectManga={onSelectManga}
        />
      ) : (
        <LibraryList
          entries={entries}
          descriptive={displayMode === "descriptiveList"}
          pageId={pageId}
          onHeight={onHeight}
          empty={empty}
          onPressManga={onPressManga}
          onLongPressManga={onLongPressManga}
          onSelectManga={onSelectManga}
        />
      )}
    </View>
  );
});

const entryId = (sourceId: string | undefined, key: string) =>
  `${sourceId ?? ""}:${key}`;

function sameEntry(a: LibraryEntry, b: LibraryEntry): boolean {
  const keys = Object.keys(b) as (keyof LibraryEntry)[];
  if (keys.length !== Object.keys(a).length) return false;
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (x === y) continue;
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length) return false;
      for (let n = 0; n < x.length; n++) if (x[n] !== y[n]) return false;
      continue;
    }
    return false;
  }
  return true;
}

function reuseEntries(
  prev: LibraryEntry[],
  next: LibraryEntry[],
): LibraryEntry[] {
  const byKey = new Map(
    prev.map((entry) => [`${entry.sourceId}:${entry.mangaKey}`, entry]),
  );
  let changed = prev.length !== next.length;
  const result = next.map((entry, index) => {
    const old = byKey.get(`${entry.sourceId}:${entry.mangaKey}`);
    const reused = old && sameEntry(old, entry) ? old : entry;
    if (reused !== prev[index]) changed = true;
    return reused;
  });
  return changed ? result : prev;
}

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { installed } = useSources();

  useEffect(() => {
    const timer = setTimeout(() => void maybeAskForReview(), 4000);
    return () => clearTimeout(timer);
  }, []);
  const { stackSearchBarProps } = useNavigationTheme();
  const illustration = useIllustrationMode();
  const refreshTick = useMangaDataRefresh();

  const pagerRef = useRef<PagerView>(null);
  const loadedOnceRef = useRef(false);
  const pagerKeyRef = useRef("");
  const selectedCategoryIdRef = useRef(ALL_CATEGORY_ID);
  const persistedCategoryIdRef = useRef(ALL_CATEGORY_ID);
  const progress = useSharedValue(0);

  const [categories, setCategories] = useState<
    { id: string; label: string; count?: number }[]
  >([]);
  const [countBadges, setCountBadges] = useState({
    show: true,
    hideEmpty: true,
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState(ALL_CATEGORY_ID);
  const [allEntries, setAllEntries] = useState<LibraryEntry[]>([]);
  const [showCategoryTabs, setShowCategoryTabs] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] =
    useState<LibraryRefreshProgress | null>(null);
  const [gridColumns, setGridColumns] = useState(3);
  const [loaded, setLoaded] = useState(false);
  const [hideCategorizedNsfw, setHideCategorizedNsfw] = useState(false);
  const [showUnreadBadges, setShowUnreadBadges] = useState(true);
  const [showCoverTitles, setShowCoverTitles] = useState(true);
  const [showDownloadedBadges, setShowDownloadedBadges] = useState(true);
  const [showLibraryRefreshStatus, setShowLibraryRefreshStatus] =
    useState(false);
  const [sortMode, setSortMode] = useState<LibrarySortMode>("unread");
  const [sortReversed, setSortReversed] = useState(false);
  const [favoritesFirst, setFavoritesFirst] = useState(false);
  const [categorySort, setCategorySort] = useState<
    Record<string, LibraryCategorySort>
  >({});
  const [displayMode, setDisplayMode] = useState<LibraryDisplayMode>("grid");
  const [filters, setFilters] = useState<LibraryFilters>(
    DEFAULT_LIBRARY_FILTERS,
  );
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCategoryIds, setMoveCategoryIds] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<LibraryCategory[]>([]);
  const [summaryExcluded, setSummaryExcluded] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [lastReadAt, setLastReadAt] = useState<Map<string, number>>(
    () => new Map(),
  );
  // Extra row details (authors, tags, rating) for the descriptive list; the in-memory detail cache
  // is empty after a relaunch, so they are loaded from the on-disk cache.
  const [detailMeta, setDetailMeta] = useState<
    Map<string, Pick<Manga, "description" | "authors" | "tags" | "rating">>
  >(() => new Map());
  const loadLibrary = useCallback(async () => {
    const [
      rawCategories,
      storedCategoryId,
      customCategories,
      settings,
      rawEntries,
    ] = await Promise.all([
      getLibraryCategories(),
      getCurrentCategoryId(),
      hasCustomLibraryCategories(),
      getAppSettings(),
      getLibraryEntries(),
    ]);

    const hiddenCategoryIds = new Set(
      settings.privacy.nsfwKillSwitch || isIllustrationMode()
        ? rawCategories
            .filter(
              (category) =>
                !isAllCategory(category.id) && /nsfw/i.test(category.name),
            )
            .map((category) => category.id)
        : [],
    );
    const nextEntries =
      hiddenCategoryIds.size === 0
        ? rawEntries
        : rawEntries.filter(
            (entry) =>
              !entry.categoryIds.some((id) => hiddenCategoryIds.has(id)),
          );
    const hideEmpty = settings.libraryDisplay.hideEmptyCategories ?? true;
    const nextCategories = rawCategories.filter(
      (category) =>
        !hiddenCategoryIds.has(category.id) &&
        (!hideEmpty ||
          isAllCategory(category.id) ||
          libraryCategoryCount(nextEntries, category.id) > 0),
    );

    const isFirstLoad = !loadedOnceRef.current;
    const wantedCategoryId = isFirstLoad
      ? storedCategoryId
      : selectedCategoryIdRef.current;

    const validCategoryId = nextCategories.some(
      (category) => category.id === wantedCategoryId,
    )
      ? wantedCategoryId
      : ALL_CATEGORY_ID;

    if (isFirstLoad) {
      persistedCategoryIdRef.current = storedCategoryId;
      loadedOnceRef.current = true;
    }

    selectedCategoryIdRef.current = validCategoryId;

    const nextPagerKey = nextCategories
      .map((category) => category.id)
      .join("|");

    if (nextPagerKey !== pagerKeyRef.current) {
      pagerKeyRef.current = nextPagerKey;
      progress.value = Math.max(
        0,
        nextCategories.findIndex((category) => category.id === validCategoryId),
      );
    }

    const nextLastRead = new Map<string, number>();
    for (const entry of rawEntries) {
      if (entry.lastReadAt) {
        nextLastRead.set(
          `${entry.sourceId}:${entry.mangaKey}`,
          entry.lastReadAt,
        );
      }
    }

    setHideCategorizedNsfw(settings.privacy.hideCategorizedNsfwInAll);
    setGridColumns(libraryDisplayColumns(settings.libraryDisplay));
    setDisplayMode(settings.libraryDisplay.displayMode);
    setSortReversed(settings.libraryDisplay.sortReversed);
    setFilters(settings.libraryDisplay.filters);
    setSummaryExcluded(
      settings.libraryDisplay.summaryExcludedCategoryIds ?? [],
    );
    setAllCategories(rawCategories);
    setShowUnreadBadges(settings.libraryDisplay.showUnreadBadges);
    setShowCoverTitles(settings.libraryDisplay.showCoverTitles ?? true);
    setShowDownloadedBadges(settings.libraryDisplay.showDownloadedBadges);
    setShowLibraryRefreshStatus(
      settings.libraryDisplay.showLibraryRefreshStatus ?? false,
    );
    setSortMode(settings.libraryDisplay.sortMode ?? "unread");
    setCategorySort(settings.libraryDisplay.categorySort ?? {});
    setFavoritesFirst(settings.libraryDisplay.favoritesFirst ?? false);
    setLastReadAt((prev) => {
      if (prev.size !== nextLastRead.size) return nextLastRead;
      for (const [key, value] of nextLastRead) {
        if (prev.get(key) !== value) return nextLastRead;
      }
      return prev;
    });
    setAllEntries((prev) => reuseEntries(prev, nextEntries));
    setLoaded(true);
    setSelectedCategoryId(validCategoryId);
    setShowCategoryTabs(customCategories);

    const showCounts = settings.libraryDisplay.showCategoryCountBadges ?? true;
    const hideEmptyCounts =
      settings.libraryDisplay.hideEmptyCategoryCountBadges ?? true;

    const nextTabs = nextCategories.map((category) => {
      const count = libraryCategoryCount(nextEntries, category.id);

      return {
        id: category.id,
        label: categoryLabel(category.id, category.name),
        count,
      };
    });
    setCountBadges((prev) =>
      prev.show === showCounts && prev.hideEmpty === hideEmptyCounts
        ? prev
        : { show: showCounts, hideEmpty: hideEmptyCounts },
    );
    setCategories((prev) =>
      JSON.stringify(prev) === JSON.stringify(nextTabs) ? prev : nextTabs,
    );

    if (persistedCategoryIdRef.current !== validCategoryId) {
      persistedCategoryIdRef.current = validCategoryId;
      await setCurrentCategoryId(validCategoryId);
    }
  }, [progress]);

  useEffect(() => {
    if (loaded) markStartupReady();
  }, [loaded]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary, refreshTick]);

  useEffect(
    () => subscribeAppSettings(() => void loadLibrary()),
    [loadLibrary],
  );

  useEffect(() => subscribeLibraryRefreshProgress(setRefreshProgress), []);

  const pagerKey = useMemo(
    () => categories.map((category) => category.id).join("|"),
    [categories],
  );

  const selectedPageIndex = Math.max(
    0,
    categories.findIndex((category) => category.id === selectedCategoryId),
  );

  const visibleEntries = useMemo(
    () =>
      illustration
        ? allEntries
            .filter(
              (entry) =>
                (findInstalledSource(installed, entry.sourceId)?.manifest.info
                  .contentRating ?? 0) < 3,
            )
            .concat(DEMO_LIBRARY_ENTRIES)
        : allEntries,
    [illustration, allEntries, installed],
  );

  // Resolved once per data change: sorting/filtering call the lookup many times per entry.
  const unreadMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of allEntries) {
      const key = `${entry.sourceId}:${entry.mangaKey}`;
      map.set(key, resolveLibraryUnreadCount(entry));
    }
    return map;
  }, [allEntries]);

  const unreadOf = useCallback(
    (entry: LibraryEntry) =>
      unreadMap.get(`${entry.sourceId}:${entry.mangaKey}`) ??
      entry.unreadCount ??
      0,
    [unreadMap],
  );

  const entriesForCategory = useCallback(
    (categoryId: string): LibraryEntry[] =>
      isAllCategory(categoryId)
        ? hideCategorizedNsfw
          ? visibleEntries.filter(
              (entry) =>
                entry.categoryIds.length === 0 ||
                (findInstalledSource(installed, entry.sourceId)?.manifest.info
                  .contentRating ?? 0) < 3,
            )
          : visibleEntries
        : visibleEntries.filter((entry) =>
            entry.categoryIds.includes(categoryId),
          ),
    [hideCategorizedNsfw, visibleEntries, installed],
  );

  // Tab counts follow what each tab actually lists (hidden NSFW and illustration mode included).
  const categoryTabs = useMemo(
    () =>
      categories.map((category) => {
        const count = entriesForCategory(category.id).length;
        return {
          ...category,
          count:
            !countBadges.show || (count === 0 && countBadges.hideEmpty)
              ? undefined
              : count,
        };
      }),
    [categories, entriesForCategory, countBadges],
  );

  // Entries already looked up on disk, so a miss is not retried on every update.
  const detailTried = useRef(new Set<string>());
  useEffect(() => {
    if (displayMode !== "descriptiveList") return;
    const missing = allEntries.filter((entry) => {
      const key = `${entry.sourceId}:${entry.mangaKey}`;
      return !detailTried.current.has(key);
    });
    if (missing.length === 0) return;
    let cancelled = false;
    // Starts late and reads in small, spaced batches so it never competes with source loading.
    const timer = setTimeout(() => {
      void (async () => {
        let pending = new Map<
          string,
          Pick<Manga, "description" | "authors" | "tags" | "rating">
        >();
        const flush = () => {
          if (pending.size === 0) return;
          const batch = pending;
          pending = new Map();
          setDetailMeta((prev) => {
            const next = new Map(prev);
            batch.forEach((value, key) => next.set(key, value));
            return next;
          });
        };
        for (let i = 0; i < missing.length; i += 4) {
          if (cancelled) {
            flush();
            return;
          }
          await Promise.all(
            missing.slice(i, i + 4).map(async (entry) => {
              const key = `${entry.sourceId}:${entry.mangaKey}`;
              detailTried.current.add(key);
              const cached = await readMangaDetailCache(
                entry.sourceId,
                entry.mangaKey,
              ).catch(() => null);
              const manga = cached?.manga;
              if (!manga) return;
              pending.set(key, {
                description: manga.description,
                authors: manga.authors,
                tags: manga.tags,
                rating: manga.rating,
              });
            }),
          );
          if (pending.size >= 40) flush();
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        flush();
      })();
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [displayMode, allEntries]);

  const toListItems = useCallback(
    (entries: LibraryEntry[], categoryId?: string): LibraryListItem[] => {
      const order = (categoryId && categorySort[categoryId]) || {
        sortMode,
        sortReversed,
        favoritesFirst,
      };
      const listMode = displayMode !== "grid";
      const filtered = filterLibraryEntries(entries, filters, unreadOf);
      return sortLibraryEntries(
        filtered,
        order.sortMode,
        lastReadAt,
        order.sortReversed,
        unreadOf,
        order.favoritesFirst ?? favoritesFirst,
      ).map((entry): LibraryListItem => {
        const key = `${entry.sourceId}:${entry.mangaKey}`;
        return {
          key: entry.mangaKey,
          title: entry.title,
          cover: entry.cover,
          sourceId: entry.sourceId,
          inLibrary: true,
          unreadCount: showUnreadBadges ? unreadOf(entry) : 0,
          downloadedCount: showDownloadedBadges
            ? (entry.downloadedCount ?? 0)
            : 0,
          updateFailed: Boolean(entry.updateFailed),
          hideTitle: !showCoverTitles,
          ...(listMode
            ? {
                sourceName: findInstalledSource(installed, entry.sourceId)
                  ?.manifest.info.name,
                statusLabel: t(`library_status_${entry.status ?? "unknown"}`),
                totalChapters: entry.chapterCount ?? 0,
                lastReadAt: lastReadAt.get(key),
                downloadedTotal: entry.downloadedCount ?? 0,
                ...(displayMode === "descriptiveList"
                  ? (() => {
                      const detail =
                        peekMangaDetailCache(entry.sourceId, entry.mangaKey)
                          ?.manga ?? detailMeta.get(key);
                      return {
                        summary: detail?.description,
                        authors: detail?.authors,
                        tags: detail?.tags,
                        rating: detail?.rating,
                      };
                    })()
                  : null),
              }
            : null),
        };
      });
    },
    [
      displayMode,
      filters,
      unreadOf,
      sortMode,
      categorySort,
      favoritesFirst,
      lastReadAt,
      detailMeta,
      sortReversed,
      showUnreadBadges,
      showDownloadedBadges,
      showCoverTitles,
      installed,
    ],
  );

  const basePages = useMemo(() => {
    const map = new Map<string, LibraryListItem[]>();
    for (const category of categories) {
      map.set(
        category.id,
        toListItems(entriesForCategory(category.id), category.id),
      );
    }
    return map;
  }, [categories, entriesForCategory, toListItems]);

  // Deferred so typing stays responsive while a large library is filtered.
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searching = deferredSearchQuery.trim().length > 0;

  // Library-wide search ignores the selected category and looks through everything at once.
  const searchItems = useMemo(() => {
    if (!searching) return EMPTY_LIST_ITEMS;
    const tokens = deferredSearchQuery.trim().toLocaleLowerCase().split(/\s+/);
    return toListItems(
      entriesForCategory(ALL_CATEGORY_ID).filter((entry) => {
        const title = entry.title.toLocaleLowerCase();
        return tokens.every((token) => title.includes(token));
      }),
    );
  }, [searching, deferredSearchQuery, entriesForCategory, toListItems]);

  // Items whose selected flag did not change keep their object identity, so memoised covers
  // do not re-render on every tap while selecting.
  const decoratedCache = useRef(
    new WeakMap<LibraryListItem, [boolean, LibraryListItem]>(),
  );
  const decorate = useCallback(
    (items: LibraryListItem[]): LibraryListItem[] =>
      selecting
        ? items.map((item) => {
            const selected = selectedIds.has(entryId(item.sourceId, item.key));
            const cached = decoratedCache.current.get(item);
            if (cached && cached[0] === selected) return cached[1];
            const next = { ...item, selecting: true, selected };
            decoratedCache.current.set(item, [selected, next]);
            return next;
          })
        : items,
    [selecting, selectedIds],
  );

  const pagesData = useMemo(() => {
    if (!selecting) return basePages;
    const map = new Map<string, LibraryListItem[]>();
    for (const [id, items] of basePages) map.set(id, decorate(items));
    return map;
  }, [basePages, selecting, decorate]);

  const searchPageItems = useMemo(
    () => decorate(searchItems),
    [decorate, searchItems],
  );

  const sourceOptions = useMemo<LibrarySourceOption[]>(() => {
    const counts = new Map<string, number>();
    for (const entry of visibleEntries) {
      counts.set(entry.sourceId, (counts.get(entry.sourceId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        count,
        name: findInstalledSource(installed, id)?.manifest.info.name ?? id,
        iconUri: findInstalledSource(installed, id)?.iconUri,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleEntries, installed]);

  const isEmpty = searching
    ? searchItems.length === 0
    : (pagesData.get(selectedCategoryId)?.length ?? 0) === 0;

  const pageScrollHandler = usePageScrollHandler({
    onPageScroll: (event) => {
      "worklet";
      progress.value = event.position + event.offset;
    },
  });

  // Folding/unfolding the iPhone Duo resizes the pager mid-gesture and can leave the category thumb
  // between tabs. Once the layout settles, snap pager and progress back to the selected page.
  const { width: pagerWindowWidth } = useWindowDimensions();
  const selectedPageIndexRef = useRef(selectedPageIndex);
  selectedPageIndexRef.current = selectedPageIndex;
  const lastWindowWidthRef = useRef(pagerWindowWidth);
  useEffect(() => {
    if (lastWindowWidthRef.current === pagerWindowWidth) return;
    lastWindowWidthRef.current = pagerWindowWidth;
    const timers = [50, 250, 600].map((delay) =>
      setTimeout(() => {
        pagerRef.current?.setPageWithoutAnimation(selectedPageIndexRef.current);
        progress.value = selectedPageIndexRef.current;
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [pagerWindowWidth, progress]);

  const handleTabPress = useCallback(
    (index: number) => {
      if (Math.abs(index - selectedPageIndex) > 1) {
        pagerRef.current?.setPageWithoutAnimation(index);
      } else {
        pagerRef.current?.setPage(index);
      }
    },
    [selectedPageIndex],
  );

  const handlePageSelected = useCallback(
    (index: number) => {
      const category = categories[index];
      if (!category) return;

      // A settled page always means an integer progress; resets a thumb left mid-way by an interrupted scroll.
      progress.value = index;
      selectedCategoryIdRef.current = category.id;
      setSelectedCategoryId(category.id);

      if (persistedCategoryIdRef.current !== category.id) {
        persistedCategoryIdRef.current = category.id;
        void setCurrentCategoryId(category.id);
      }

      void Haptics.selectionAsync();
    },
    [categories],
  );

  const refreshLibrary = useCallback(
    async (categoryId: string, force = false, failedOnly = false) => {
      setRefreshing(true);
      try {
        await refreshLibraryEntries(installed, categoryId, undefined, {
          force,
          failedOnly,
        });
        await loadLibrary();
      } finally {
        setRefreshing(false);
      }
    },
    [installed, loadLibrary],
  );

  // Pull-to-refresh updates the category that is currently on screen.
  // Pull-to-refresh always updates the whole library using the configured update settings, whatever category is open.
  const handleRefresh = useCallback(() => {
    void refreshLibrary(ALL_CATEGORY_ID);
  }, [refreshLibrary]);

  // Refreshing a single category is explicit and skips the update-filter settings; refreshing all respects them.
  const handleRefreshCategory = useCallback(() => {
    void refreshLibrary(selectedCategoryId, true);
  }, [refreshLibrary, selectedCategoryId]);

  const handleRefreshFailed = useCallback(() => {
    void refreshLibrary(selectedCategoryId, true, true);
  }, [refreshLibrary, selectedCategoryId]);

  const handleRefreshAll = useCallback(() => {
    void refreshLibrary(ALL_CATEGORY_ID);
  }, [refreshLibrary]);

  const openManga = useCallback(
    (manga: MangaGridItem, entry: LibraryEntry) => {
      const source = findInstalledSource(installed, entry.sourceId);

      router.navigate(
        mangaHref(source ? sourceRouteId(source) : entry.sourceId, manga),
      );
    },
    [installed, router],
  );

  const toggleSelected = useCallback((manga: MangaGridItem) => {
    const id = entryId(manga.sourceId, manga.key);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    void Haptics.selectionAsync();
  }, []);

  const handlePressManga = useCallback(
    (manga: MangaGridItem) => {
      if (selecting) {
        toggleSelected(manga);
        return;
      }
      const entry = allEntries.find(
        (item) =>
          item.mangaKey === manga.key && item.sourceId === manga.sourceId,
      );

      if (entry) openManga(manga, entry);
    },
    [allEntries, openManga, selecting, toggleSelected],
  );

  const startSelectionWith = useCallback((manga: MangaGridItem) => {
    setSelectedIds(new Set([entryId(manga.sourceId, manga.key)]));
    setSelecting(true);
  }, []);

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const selectAllVisible = useCallback(() => {
    const items = searching
      ? searchItems
      : (basePages.get(selectedCategoryId) ?? EMPTY_LIST_ITEMS);
    setSelectedIds(
      new Set(items.map((item) => entryId(item.sourceId, item.key))),
    );
  }, [searching, searchItems, basePages, selectedCategoryId]);

  const selectedEntries = useCallback(
    () =>
      allEntries.filter((entry) =>
        selectedIds.has(entryId(entry.sourceId, entry.mangaKey)),
      ),
    [allEntries, selectedIds],
  );

  const markSelected = useCallback(
    async (read: boolean, targets?: LibraryEntry[]) => {
      const entries = targets ?? selectedEntries();
      // Leave selection mode right away; the work below can take a while.
      exitSelection();
      for (const entry of entries) {
        const keys = await chapterKeysForLibraryEntry(entry);
        if (keys.length === 0) continue;
        if (read) {
          await markAllChaptersRead(entry.sourceId, entry.mangaKey, keys, {
            mangaTitle: entry.title,
            cover: entry.cover,
          });
        } else {
          await markAllChaptersUnread(entry.sourceId, entry.mangaKey, keys);
        }
        await updateLibraryEntryMetadata(entry.sourceId, entry.mangaKey, {
          unreadCount: read ? 0 : keys.length,
        });
      }
      await loadLibrary();
    },
    [selectedEntries, exitSelection, loadLibrary],
  );

  // Entries of the category on screen, as filtered by the user: category-wide actions apply only to these.
  const categoryEntries = useMemo(
    () =>
      filterLibraryEntries(
        entriesForCategory(selectedCategoryId),
        filters,
        unreadOf,
      ),
    [entriesForCategory, selectedCategoryId, filters, unreadOf],
  );

  const removeCategoryDownloads = useCallback(() => {
    const targets = categoryEntries.filter(
      (entry) => (entry.downloadedCount ?? 0) > 0,
    );
    if (targets.length === 0) return;
    Alert.alert(
      t("library_remove_downloads_confirm", { count: String(targets.length) }),
      undefined,
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("library_remove_downloads"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              for (const entry of targets) {
                await removeMangaDownloads(entry.sourceId, entry.mangaKey);
              }
              await loadLibrary();
            })();
          },
        },
      ],
    );
  }, [categoryEntries, loadLibrary]);

  const refreshSelected = useCallback(() => {
    const keys = selectedEntries().map(
      (entry) => `${entry.sourceId}:${entry.mangaKey}`,
    );
    exitSelection();
    if (keys.length === 0) return;
    setRefreshing(true);
    void refreshLibraryEntries(installed, undefined, undefined, {
      onlyKeys: keys,
    })
      .then(() => loadLibrary())
      .finally(() => setRefreshing(false));
  }, [selectedEntries, exitSelection, installed, loadLibrary]);

  const removeSelected = useCallback(() => {
    const targets = selectedEntries();
    if (targets.length === 0) return;
    Alert.alert(
      t("library_remove_selected_confirm", { count: String(targets.length) }),
      undefined,
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("library_remove_selected"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              for (const entry of targets) {
                await removeFromLibrary(entry.sourceId, entry.mangaKey);
              }
              exitSelection();
              await loadLibrary();
            })();
          },
        },
      ],
    );
  }, [selectedEntries, exitSelection, loadLibrary]);

  const downloadSelected = useCallback(
    async (unreadOnly: boolean, targets?: LibraryEntry[]) => {
      const items: Parameters<typeof queueChapterDownloads>[0] = [];
      const entries = targets ?? selectedEntries();
      exitSelection();
      for (const entry of entries) {
        const cached = peekMangaDetailCache(entry.sourceId, entry.mangaKey)
          ?.manga.chapters;
        let chapters = cached
          ? chaptersOldestFirst(cached).map((chapter) => ({
              key: chapter.key,
              title: formatChapterLabel(chapter),
            }))
          : (await chapterKeysForLibraryEntry(entry)).map((key) => ({
              key,
              title: key,
            }));
        if (unreadOnly) {
          const progress = await getMangaChapterProgress(
            entry.sourceId,
            entry.mangaKey,
          );
          chapters = chapters.filter(
            (chapter) => progress[chapter.key]?.page !== -1,
          );
        }
        for (const chapter of chapters) {
          items.push({
            sourceId: entry.sourceId,
            mangaKey: entry.mangaKey,
            chapterKey: chapter.key,
            mangaTitle: entry.title,
            chapterTitle: chapter.title,
          });
        }
      }
      if (items.length === 0) return;
      await queueChapterDownloads(items);
      void processQueuedDownloads(installed);
      Alert.alert(t("library_download_queued"));
    },
    [selectedEntries, exitSelection, installed],
  );

  const openMovePicker = useCallback(() => {
    void getLibraryCategories().then(setAllCategories);
    setMoveCategoryIds([]);
    setMoveOpen(true);
  }, []);

  const confirmMove = useCallback(
    async (categoryIds: string[]) => {
      setMoveOpen(false);
      const entries = selectedEntries();
      exitSelection();
      for (const entry of entries) {
        await setLibraryCategories(entry.sourceId, entry.mangaKey, categoryIds);
      }
      await loadLibrary();
    },
    [selectedEntries, exitSelection, loadLibrary],
  );

  const summaryItems = useMemo<LibrarySummaryItem[]>(
    () =>
      !summaryOpen
        ? []
        : entriesForCategory(ALL_CATEGORY_ID)
            // Hidden only when every category of the title is excluded; uncategorised titles always stay.
            .filter(
              (entry) =>
                entry.categoryIds.length === 0 ||
                entry.categoryIds.some((id) => !summaryExcluded.includes(id)),
            )
            .map((entry) => ({ entry, unread: unreadOf(entry) }))
            .filter((item) => item.unread > 0)
            .sort(
              (a, b) =>
                b.unread - a.unread ||
                a.entry.title.localeCompare(b.entry.title),
            ),
    [summaryOpen, entriesForCategory, unreadOf, summaryExcluded],
  );

  const summaryCategories = useMemo(
    () =>
      allCategories
        .filter((category) => !isAllCategory(category.id))
        .map((category) => ({ id: category.id, name: category.name })),
    [allCategories],
  );

  const toggleSummaryCategory = useCallback(
    (categoryId: string) => {
      const next = summaryExcluded.includes(categoryId)
        ? summaryExcluded.filter((id) => id !== categoryId)
        : [...summaryExcluded, categoryId];
      setSummaryExcluded(next);
      void updateAppSettings({
        libraryDisplay: { summaryExcludedCategoryIds: next },
      });
    },
    [summaryExcluded],
  );

  const handleOpenFromSummary = useCallback(
    (entry: LibraryEntry) => {
      setSummaryOpen(false);
      openManga(
        {
          key: entry.mangaKey,
          title: entry.title,
          cover: entry.cover,
          sourceId: entry.sourceId,
        },
        entry,
      );
    },
    [openManga],
  );

  const isRefreshingAny = refreshing || refreshProgress != null;
  const filtersActive = hasActiveLibraryFilters(filters);
  const hasCategoryScope =
    showCategoryTabs && !isAllCategory(selectedCategoryId);

  const menuItems = useMemo<LibraryMenuItem[]>(() => {
    if (selecting) {
      return [
        {
          key: "select-all",
          label: t("library_select_all"),
          sf: "checkmark.circle",
          icon: "checkmark-circle-outline",
          onPress: selectAllVisible,
        },
        {
          key: "mark",
          label: t("library_mark_as"),
          sf: "checkmark.rectangle.stack",
          icon: "checkmark-done-outline",
          children: [
            {
              key: "mark-read",
              label: t("manga_read"),
              sf: "checkmark.circle",
              icon: "checkmark-done-outline",
              onPress: () => void markSelected(true),
            },
            {
              key: "mark-unread",
              label: t("manga_unread"),
              sf: "circle",
              icon: "ellipse-outline",
              onPress: () => void markSelected(false),
            },
          ],
        },
        {
          key: "download",
          label: t("library_download"),
          sf: "arrow.down.circle",
          icon: "download-outline",
          children: [
            {
              key: "download-all",
              label: t("manga_download_all_chapters"),
              sf: "square.stack",
              icon: "download-outline",
              onPress: () => void downloadSelected(false),
            },
            {
              key: "download-unread",
              label: t("manga_download_unread_chapters"),
              sf: "circle",
              icon: "arrow-down-circle-outline",
              onPress: () => void downloadSelected(true),
            },
          ],
        },
        {
          key: "refresh-selected",
          label: t("library_refresh"),
          sf: "arrow.clockwise",
          icon: "refresh-outline",
          onPress: refreshSelected,
        },
        {
          key: "move",
          label: t("library_move"),
          sf: "folder",
          icon: "folder-outline",
          onPress: openMovePicker,
        },
        {
          key: "remove",
          label: t("library_remove_selected"),
          sf: "trash",
          icon: "trash-outline",
          destructive: true,
          onPress: removeSelected,
        },
      ];
    }
    const items: LibraryMenuItem[] = [
      {
        key: "select",
        label: t("library_select"),
        sf: "checkmark.circle",
        icon: "checkmark-circle-outline",
        onPress: () => setSelecting(true),
      },
    ];
    if (!isRefreshingAny) {
      const refreshChildren: LibraryMenuItem[] = [];
      if (hasCategoryScope) {
        refreshChildren.push({
          key: "refresh-category",
          label: t("library_refresh_category"),
          sf: "arrow.clockwise",
          icon: "refresh-outline",
          onPress: handleRefreshCategory,
        });
      }
      refreshChildren.push({
        key: "refresh-all",
        label: t("library_refresh_all"),
        sf: "arrow.triangle.2.circlepath",
        icon: "sync-outline",
        onPress: handleRefreshAll,
      });
      if (hasCategoryScope) {
        refreshChildren.push({
          key: "refresh-failed",
          label: t("library_refresh_failed"),
          sf: "exclamationmark.arrow.circlepath",
          icon: "alert-circle-outline",
          onPress: handleRefreshFailed,
        });
      }
      items.push({
        key: "refresh",
        label: t("library_refresh"),
        sf: "arrow.clockwise",
        icon: "refresh-outline",
        children: refreshChildren,
      });
    }
    items.push(
      {
        key: "mark-all",
        label: t("library_mark_all"),
        sf: "checkmark.circle",
        icon: "checkmark-done-outline",
        children: [
          {
            key: "mark-all-read",
            label: t("manga_read"),
            sf: "checkmark",
            icon: "checkmark-done-outline",
            onPress: () => void markSelected(true, categoryEntries),
          },
          {
            key: "mark-all-unread",
            label: t("manga_unread"),
            sf: "circle",
            icon: "ellipse-outline",
            onPress: () => void markSelected(false, categoryEntries),
          },
        ],
      },
      {
        key: "download-all-menu",
        label: t("library_download"),
        sf: "arrow.down.circle",
        icon: "download-outline",
        children: [
          {
            key: "download-category-all",
            label: t("manga_download_all_chapters"),
            sf: "square.stack",
            icon: "download-outline",
            onPress: () => void downloadSelected(false, categoryEntries),
          },
          {
            key: "download-category-unread",
            label: t("manga_download_unread_chapters"),
            sf: "circle",
            icon: "arrow-down-circle-outline",
            onPress: () => void downloadSelected(true, categoryEntries),
          },
        ],
      },
    );
    items.push({
      key: "summary",
      label: t("library_summary"),
      sf: "list.bullet.rectangle",
      icon: "list-outline",
      onPress: () => setSummaryOpen(true),
    });
    if (categoryEntries.some((entry) => (entry.downloadedCount ?? 0) > 0)) {
      items.push({
        key: "remove-downloads",
        label: t("library_remove_downloads"),
        sf: "trash",
        icon: "trash-outline",
        destructive: true,
        onPress: removeCategoryDownloads,
      });
    }
    return items;
  }, [
    selecting,
    selectAllVisible,
    markSelected,
    downloadSelected,
    openMovePicker,
    removeSelected,
    refreshSelected,
    exitSelection,
    isRefreshingAny,
    hasCategoryScope,
    handleRefreshCategory,
    handleRefreshAll,
    handleRefreshFailed,
    categoryEntries,
    removeCategoryDownloads,
  ]);

  const handleSearchText = useCallback(
    (event: { nativeEvent: { text: string } }) =>
      setSearchQuery(event.nativeEvent.text),
    [],
  );

  const searchBarReset = useSearchBarReset(() =>
    handleSearchText({ nativeEvent: { text: "" } }),
  );
  const handleSearchHeight = useCallback(() => {}, []);

  const hasCategoryTabs = showCategoryTabs && categories.length > 1;
  const { pagerHeight, onHeight: handlePageHeight } = usePagerHeights(
    categories.map((category) => category.id),
    selectedPageIndex,
  );
  const {
    onScroll: handlePinnedScroll,
    spacer,
    renderTabs,
  } = usePinnedTabs(hasCategoryTabs && !searching);
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={false}
        onRefresh={handleRefresh}
        tintColor={colors.secondaryLabel}
      />
    ),
    [handleRefresh, colors.tint],
  );

  const libraryIsEmpty = allEntries.length === 0 && !illustration;
  const emptyTitle = libraryIsEmpty
    ? t("library_empty_title")
    : t("library_search_empty");
  const emptyDescription = libraryIsEmpty
    ? t("library_empty_desc")
    : t("library_search_empty_desc");

  const emptyState = (
    <EmptyState
      icon="library-outline"
      title={emptyTitle}
      description={emptyDescription}
    />
  );
  const belowTabsEmpty = (
    <View style={styles.emptyBelowTabs}>{emptyState}</View>
  );

  const refreshStatus =
    Platform.OS !== "ios" && showLibraryRefreshStatus && refreshProgress ? (
      <View style={styles.refreshStatus}>
        <ThemedText
          variant="subheadline"
          numberOfLines={1}
          style={styles.refreshText}
        >
          {refreshProgress.title}
        </ThemedText>
        <ThemedText
          variant="caption1"
          color="secondaryLabel"
          style={styles.refreshText}
        >
          {t("library_refresh_progress", {
            current: String(refreshProgress.current),
            total: String(refreshProgress.total),
          })}
        </ThemedText>
      </View>
    ) : null;

  const listHeader = <IncognitoModeBanner />;
  const longPressHandler = selecting ? toggleSelected : undefined;
  const selectHandler = selecting ? undefined : startSelectionWith;

  return (
    <>
      {Platform.OS === "ios" ? (
        <>
          <Stack.Toolbar placement="left">
            {selecting ? (
              <Stack.Toolbar.Button
                icon="xmark"
                accessibilityLabel={t("library_select_cancel")}
                tintColor={colors.label}
                onPress={exitSelection}
              />
            ) : (
              <Stack.Toolbar.Button
                icon="line.3.horizontal.decrease"
                accessibilityLabel={t("library_options_button")}
                tintColor={filtersActive ? colors.tint : colors.label}
                onPress={() => setOptionsOpen(true)}
              />
            )}
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Menu
              icon="ellipsis"
              accessibilityLabel={t("library_menu")}
              separateBackground
              tintColor={colors.label}
            >
              {menuItems.map((item) =>
                item.children ? (
                  <Stack.Toolbar.Menu
                    key={item.key}
                    icon={item.sf as never}
                    title={item.label}
                  >
                    {item.children.map((child) => (
                      <Stack.Toolbar.MenuAction
                        key={child.key}
                        icon={child.sf as never}
                        onPress={child.onPress}
                      >
                        {child.label}
                      </Stack.Toolbar.MenuAction>
                    ))}
                  </Stack.Toolbar.Menu>
                ) : (
                  <Stack.Toolbar.MenuAction
                    key={item.key}
                    icon={item.sf as never}
                    destructive={item.destructive}
                    onPress={item.onPress}
                  >
                    {item.label}
                  </Stack.Toolbar.MenuAction>
                ),
              )}
            </Stack.Toolbar.Menu>
          </Stack.Toolbar>
        </>
      ) : (
        <Stack.Screen
          options={{
            headerRight: () => (
              <View style={styles.headerActions}>
                {isRefreshingAny ? (
                  <View style={styles.headerSpinner}>
                    <ActivityIndicator color={colors.label} />
                  </View>
                ) : null}
                {selecting ? (
                  <HeaderIconButton
                    icon="close"
                    accessibilityLabel={t("library_select_cancel")}
                    onPress={exitSelection}
                  />
                ) : (
                  <HeaderIconButton
                    icon={filtersActive ? "funnel" : "funnel-outline"}
                    accessibilityLabel={t("library_options_button")}
                    onPress={() => setOptionsOpen(true)}
                  />
                )}
                <AndroidPopupMenu
                  items={menuItems}
                  accessibilityLabel={t("library_menu")}
                />
              </View>
            ),
          }}
        />
      )}

      <Stack.Title large>
        {selecting
          ? t("library_selected_count", { count: String(selectedIds.size) })
          : t("library")}
      </Stack.Title>

      {!loaded ? (
        <ScreenContent padded={false} scrollEnabled={false}>
          <MangaGridSkeleton columns={gridColumns} />
        </ScreenContent>
      ) : isEmpty && !showCategoryTabs && !searching ? (
        <ScreenContent centerContent={!refreshing} scrollable={refreshing}>
          {refreshStatus}
          {emptyState}
        </ScreenContent>
      ) : (
        <View style={styles.root}>
          <LiquidGlassScrollComponent
            contentInsetAdjustmentBehavior="automatic"
            automaticallyAdjustsScrollIndicatorInsets
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
            alwaysBounceVertical
            onScroll={handlePinnedScroll}
            scrollEventThrottle={16}
          >
            {listHeader}
            {spacer}
            {refreshStatus}
            {searching ? (
              <LibraryPage
                key="search"
                pageId="search"
                entries={searchPageItems}
                columns={gridColumns}
                displayMode={displayMode}
                empty={belowTabsEmpty}
                onHeight={handleSearchHeight}
                onPressManga={handlePressManga}
                onLongPressManga={longPressHandler}
                onSelectManga={selectHandler}
              />
            ) : (
              <>
                <AnimatedPagerView
                  ref={pagerRef}
                  key={pagerKey}
                  style={{ height: pagerHeight }}
                  initialPage={selectedPageIndex}
                  onPageScroll={pageScrollHandler as never}
                  onPageSelected={(event) =>
                    handlePageSelected(event.nativeEvent.position)
                  }
                  scrollEnabled={showCategoryTabs && categories.length > 1}
                  offscreenPageLimit={1}
                >
                  {categories.map((category) => (
                    <LibraryPage
                      key={category.id}
                      pageId={category.id}
                      entries={pagesData.get(category.id) ?? EMPTY_ENTRIES}
                      columns={gridColumns}
                      displayMode={displayMode}
                      empty={belowTabsEmpty}
                      onHeight={handlePageHeight}
                      onPressManga={handlePressManga}
                      onLongPressManga={longPressHandler}
                      onSelectManga={selectHandler}
                    />
                  ))}
                </AnimatedPagerView>
                {renderTabs(
                  <LibraryCategoryTabs
                    fullWidth
                    key={pagerKey}
                    tabs={categoryTabs}
                    progress={progress}
                    onPress={handleTabPress}
                  />,
                )}
              </>
            )}
          </LiquidGlassScrollComponent>
        </View>
      )}

      <LibraryOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        sources={sourceOptions}
        categoryId={selectedCategoryId}
        categoryName={
          categories.find((category) => category.id === selectedCategoryId)
            ?.label ?? ""
        }
      />
      <LibraryCategoryPicker
        visible={moveOpen}
        categories={allCategories}
        selectedIds={moveCategoryIds}
        onChange={setMoveCategoryIds}
        onClose={() => setMoveOpen(false)}
        onConfirm={(ids) => void confirmMove(ids)}
      />
      <LibrarySummarySheet
        visible={summaryOpen}
        items={summaryItems}
        categories={summaryCategories}
        excludedCategoryIds={summaryExcluded}
        onToggleCategory={toggleSummaryCategory}
        onClose={() => setSummaryOpen(false)}
        onOpenManga={handleOpenFromSummary}
      />

      {!selecting ? (
        <Stack.SearchBar
          key={isDark ? "library-search-dark" : "library-search-light"}
          placeholder={t("library_search_placeholder")}
          {...stackSearchBarProps}
          placement="integratedButton"
          tintColor={colors.tint}
          onChangeText={handleSearchText}
          onSearchButtonPress={(event) => {
            searchBarReset.onSearchPress();
            handleSearchText(event);
          }}
          onFocus={searchBarReset.onFocus}
          onBlur={searchBarReset.onBlur}
          onCancelButtonPress={() =>
            handleSearchText({ nativeEvent: { text: "" } })
          }
          onClose={() => handleSearchText({ nativeEvent: { text: "" } })}
        />
      ) : null}
      {Platform.OS === "ios" && showLibraryRefreshStatus && refreshProgress ? (
        <View
          pointerEvents="none"
          style={[
            styles.statusPillHost,
            { bottom: BottomTabInset + insets.bottom + Spacing.sm },
          ]}
        >
          <GlassSurface borderRadius={22} glassStyle="regular">
            <View style={styles.statusPill}>
              <ThemedText
                variant="subheadline"
                numberOfLines={1}
                style={styles.refreshText}
              >
                {refreshProgress.title}
              </ThemedText>
              <ThemedText
                variant="caption1"
                color="secondaryLabel"
                style={styles.refreshText}
              >
                {t("library_refresh_progress", {
                  current: String(refreshProgress.current),
                  total: String(refreshProgress.total),
                })}
              </ThemedText>
            </View>
          </GlassSurface>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerSpinner: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPillHost: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  statusPill: {
    width: 240,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    gap: 2,
  },
  refreshStatus: {
    alignItems: "center",
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: 2,
  },
  refreshText: {
    textAlign: "center",
  },
  emptyBelowTabs: {
    paddingTop: Spacing.xl,
  },
});
