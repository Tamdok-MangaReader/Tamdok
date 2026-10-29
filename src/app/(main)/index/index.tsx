import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, RefreshControl, StyleSheet, View } from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";
import PagerView from "react-native-pager-view";

import { LibraryCategoryTabs } from "@/components/library/library-category-tabs";
import { LibraryMangaActionsMenu } from "@/components/library/library-manga-actions-menu";
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
import { Spacing } from "@/constants/theme";
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
  getCurrentCategoryId,
  getLibraryCategories,
  getLibraryEntries,
  hasCustomLibraryCategories,
  isAllCategory,
  libraryCategoryCount,
  removeFromLibrary,
  setCurrentCategoryId,
  sortLibraryEntries,
  toggleMangaLibraryCategory,
  updateLibraryEntryMetadata,
  type LibraryCategory,
  type LibraryEntry,
} from "@/services/library";
import {
  getAppSettings,
  libraryGridColumns,
  type LibrarySortMode,
} from "@/services/app-settings";
import {
  getHistoryEntries,
  markAllChaptersRead,
  markAllChaptersUnread,
} from "@/services/manga-tracking";
import { subscribeAppSettings } from "@/utils/app-settings-events";
import { findInstalledSource, sourceRouteId } from "@/services/sources";
import { mangaHref, mangaTransferHref } from "@/utils/manga-route";

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

const EMPTY_ENTRIES: MangaGridItem[] = [];

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
  entries: MangaGridItem[];
  columns: number;
  pageId: string;
  onHeight: (pageId: string, height: number) => void;
  onPressManga: (manga: MangaGridItem) => void;
  onLongPressManga: (manga: MangaGridItem) => void;
};

const EMPTY_BELOW_TABS = <EmptyBelowTabs />;

const LibraryPage = memo(function LibraryPage({
  entries,
  columns,
  pageId,
  onHeight,
  onPressManga,
  onLongPressManga,
}: LibraryPageProps) {
  return (
    <View collapsable={false} style={styles.root}>
      <VirtualMangaGrid
        entries={entries}
        columns={columns}
        pageId={pageId}
        onHeight={onHeight}
        showBookmark={false}
        scaleBadges
        empty={EMPTY_BELOW_TABS}
        onPressManga={onPressManga}
        onLongPressManga={onLongPressManga}
      />
    </View>
  );
});

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
  const router = useRouter();
  const { colors } = useTheme();
  const { installed } = useSources();
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
  const [showDownloadedBadges, setShowDownloadedBadges] = useState(true);
  const [showLibraryRefreshStatus, setShowLibraryRefreshStatus] =
    useState(false);
  const [sortMode, setSortMode] = useState<LibrarySortMode>("unread");
  const [lastReadAt, setLastReadAt] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [libraryCategories, setLibraryCategories] = useState<LibraryCategory[]>(
    [],
  );
  const [menuEntry, setMenuEntry] = useState<LibraryEntry | null>(null);

  const menuEntryRef = useRef<LibraryEntry | null>(null);

  useEffect(() => {
    menuEntryRef.current = menuEntry;
  }, [menuEntry]);

  const loadLibrary = useCallback(async () => {
    const [
      rawCategories,
      storedCategoryId,
      customCategories,
      settings,
      history,
      rawEntries,
    ] = await Promise.all([
      getLibraryCategories(),
      getCurrentCategoryId(),
      hasCustomLibraryCategories(),
      getAppSettings(),
      getHistoryEntries(),
      getLibraryEntries(),
    ]);

    const hiddenCategoryIds = new Set(
      settings.privacy.nsfwKillSwitch
        ? rawCategories
            .filter(
              (category) =>
                !isAllCategory(category.id) &&
                /nsfw/i.test(category.name),
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

    for (const item of history) {
      const key = `${item.sourceId}:${item.mangaKey}`;
      if (!nextLastRead.has(key)) {
        nextLastRead.set(key, item.dateRead);
      }
    }

    setHideCategorizedNsfw(settings.privacy.hideCategorizedNsfwInAll);
    setGridColumns(libraryGridColumns(settings.libraryDisplay.gridSize));
    setShowUnreadBadges(settings.libraryDisplay.showUnreadBadges);
    setShowDownloadedBadges(settings.libraryDisplay.showDownloadedBadges);
    setShowLibraryRefreshStatus(
      settings.libraryDisplay.showLibraryRefreshStatus ?? false,
    );
    setSortMode(settings.libraryDisplay.sortMode ?? "unread");
    setLastReadAt((prev) => {
      if (prev.size !== nextLastRead.size) return nextLastRead;
      for (const [key, value] of nextLastRead) {
        if (prev.get(key) !== value) return nextLastRead;
      }
      return prev;
    });
    setLibraryCategories((prev) =>
      JSON.stringify(prev) === JSON.stringify(nextCategories)
        ? prev
        : nextCategories,
    );
    setAllEntries((prev) => reuseEntries(prev, nextEntries));
    setLoaded(true);
    setSelectedCategoryId(validCategoryId);
    setShowCategoryTabs(customCategories);

    const showCounts = settings.libraryDisplay.showCategoryCountBadges ?? true;
    const showEmpty =
      settings.libraryDisplay.showEmptyCategoryCountBadges ?? false;

    const nextTabs = nextCategories.map((category) => {
      const count = libraryCategoryCount(nextEntries, category.id);

      return {
        id: category.id,
        label: categoryLabel(category.id, category.name),
        count: !showCounts || (count === 0 && !showEmpty) ? undefined : count,
      };
    });
    setCategories((prev) =>
      JSON.stringify(prev) === JSON.stringify(nextTabs) ? prev : nextTabs,
    );

    if (persistedCategoryIdRef.current !== validCategoryId) {
      persistedCategoryIdRef.current = validCategoryId;
      await setCurrentCategoryId(validCategoryId);
    }
  }, [progress]);

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

  const pagesData = useMemo(() => {
    const map = new Map<string, MangaGridItem[]>();

    for (const category of categories) {
      const filtered = isAllCategory(category.id)
        ? hideCategorizedNsfw
          ? allEntries.filter(
              (entry) =>
                entry.categoryIds.length === 0 ||
                (findInstalledSource(installed, entry.sourceId)?.manifest.info
                  .contentRating ?? 0) < 3,
            )
          : allEntries
        : allEntries.filter((entry) => entry.categoryIds.includes(category.id));

      map.set(
        category.id,
        sortLibraryEntries(filtered, sortMode, lastReadAt).map(
          (entry): MangaGridItem => ({
            key: entry.mangaKey,
            title: entry.title,
            cover: entry.cover,
            sourceId: entry.sourceId,
            inLibrary: true,
            unreadCount: showUnreadBadges ? (entry.unreadCount ?? 0) : 0,
            downloadedCount: showDownloadedBadges
              ? (entry.downloadedCount ?? 0)
              : 0,
            updateFailed: Boolean(entry.updateFailed),
          }),
        ),
      );
    }

    return map;
  }, [
    categories,
    allEntries,
    hideCategorizedNsfw,
    installed,
    sortMode,
    lastReadAt,
    showUnreadBadges,
    showDownloadedBadges,
  ]);

  const isEmpty = (pagesData.get(selectedCategoryId)?.length ?? 0) === 0;

  const pageScrollHandler = usePageScrollHandler({
    onPageScroll: (event) => {
      "worklet";
      progress.value = event.position + event.offset;
    },
  });

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

  const refreshLibrary = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshLibraryEntries(installed, selectedCategoryId);
      await loadLibrary();
    } finally {
      setRefreshing(false);
    }
  }, [installed, selectedCategoryId, loadLibrary]);

  const handleRefresh = useCallback(() => {
    void refreshLibrary();
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

  const handleTransfer = useCallback(() => {
    if (!menuEntry) return;
    router.navigate(
      mangaTransferHref(
        menuEntry.sourceId,
        menuEntry.mangaKey,
        menuEntry.title,
        menuEntry.cover,
      ),
    );
  }, [menuEntry, router]);

  const handlePressManga = useCallback(
    (manga: MangaGridItem) => {
      const entry = allEntries.find(
        (item) =>
          item.mangaKey === manga.key && item.sourceId === manga.sourceId,
      );

      if (entry) openManga(manga, entry);
    },
    [allEntries, openManga],
  );

  const openMangaMenu = useCallback(
    (manga: MangaGridItem) => {
      const entry = allEntries.find(
        (item) =>
          item.mangaKey === manga.key && item.sourceId === manga.sourceId,
      );

      if (entry) setMenuEntry(entry);
    },
    [allEntries],
  );

  const closeMangaMenu = useCallback(() => {
    setMenuEntry(null);
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    const entry = menuEntryRef.current;
    if (!entry) return;

    const keys = chapterKeysForLibraryEntry(entry);

    if (keys.length === 0) {
      Alert.alert(t("library_mark_chapters"), t("library_no_chapters_to_mark"));
      return;
    }

    await markAllChaptersRead(entry.sourceId, entry.mangaKey, keys, {
      mangaTitle: entry.title,
      cover: entry.cover,
    });

    await updateLibraryEntryMetadata(entry.sourceId, entry.mangaKey, {
      unreadCount: 0,
    });

    await loadLibrary();
  }, [loadLibrary]);

  const handleMarkAllUnread = useCallback(async () => {
    const entry = menuEntryRef.current;
    if (!entry) return;

    const keys = chapterKeysForLibraryEntry(entry);

    if (keys.length === 0) {
      Alert.alert(t("library_mark_chapters"), t("library_no_chapters_to_mark"));
      return;
    }

    await markAllChaptersUnread(entry.sourceId, entry.mangaKey, keys);

    await updateLibraryEntryMetadata(entry.sourceId, entry.mangaKey, {
      unreadCount: keys.length,
    });

    await loadLibrary();
  }, [loadLibrary]);

  const handleToggleCategory = useCallback(
    async (categoryId: string) => {
      const entry = menuEntryRef.current;
      if (!entry) return;

      const result = await toggleMangaLibraryCategory(
        entry.sourceId,
        entry.mangaKey,
        categoryId,
        {
          title: entry.title,
          cover: entry.cover,
          unreadCount: entry.unreadCount,
          downloadedCount: entry.downloadedCount,
          knownChapterKeys: entry.knownChapterKeys,
          status: entry.status,
        },
      );

      if (!result.inLibrary) {
        setMenuEntry(null);
      } else {
        setMenuEntry((current) =>
          current ? { ...current, categoryIds: result.categoryIds } : current,
        );
      }

      await loadLibrary();
    },
    [loadLibrary],
  );

  const handleDeleteManga = useCallback(() => {
    const entry = menuEntryRef.current;
    if (!entry) return;

    Alert.alert(t("manga_remove_from_library"), entry.title, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("manga_remove_from_library"),
        style: "destructive",
        onPress: async () => {
          setMenuEntry(null);
          await removeFromLibrary(entry.sourceId, entry.mangaKey);
          await loadLibrary();
        },
      },
    ]);
  }, [loadLibrary]);

  const hasCategoryTabs = showCategoryTabs && categories.length > 0;
  const { pagerHeight, onHeight: handlePageHeight } = usePagerHeights(
    categories.map((category) => category.id),
    selectedPageIndex,
  );
  const { spacerHeight, renderOverlay } = usePinnedTabs(hasCategoryTabs);
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={false}
        onRefresh={handleRefresh}
        tintColor={colors.tint}
      />
    ),
    [handleRefresh, colors.tint],
  );

  const emptyState = (
    <EmptyState
      icon="library-outline"
      title={t("library_empty_title")}
      description={t("library_empty_desc")}
    />
  );

  const refreshStatus =
    showLibraryRefreshStatus && refreshProgress ? (
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

  const listHeader = (
    <>
      <IncognitoModeBanner />
      {refreshStatus}
    </>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderIconButton
              icon="refresh-outline"
              accessibilityLabel={t("library_refresh_all")}
              onPress={handleRefresh}
            />
          ),
        }}
      />

      <Stack.Title>{t("library")}</Stack.Title>

      {!loaded ? (
        <ScreenContent padded={false} scrollEnabled={false}>
          <MangaGridSkeleton columns={gridColumns} />
        </ScreenContent>
      ) : isEmpty && !showCategoryTabs ? (
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
            refreshControl={isEmpty ? undefined : refreshControl}
          >
            {listHeader}
            <View style={{ height: spacerHeight }} />
            <AnimatedPagerView
              ref={pagerRef}
              key={pagerKey}
              style={{ height: pagerHeight }}
              initialPage={selectedPageIndex}
              onPageScroll={pageScrollHandler}
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
                  onHeight={handlePageHeight}
                  onPressManga={handlePressManga}
                  onLongPressManga={openMangaMenu}
                />
              ))}
            </AnimatedPagerView>
          </LiquidGlassScrollComponent>
          {renderOverlay(
            <LibraryCategoryTabs
              key={pagerKey}
              tabs={categories}
              progress={progress}
              onPress={handleTabPress}
            />,
          )}
        </View>
      )}

      <LibraryMangaActionsMenu
        visible={menuEntry != null}
        title={menuEntry?.title ?? ""}
        categories={libraryCategories}
        selectedCategoryIds={menuEntry?.categoryIds ?? []}
        onMarkAllRead={() => void handleMarkAllRead()}
        onMarkAllUnread={() => void handleMarkAllUnread()}
        onToggleCategory={(categoryId) => void handleToggleCategory(categoryId)}
        onTransfer={handleTransfer}
        onDelete={handleDeleteManga}
        onClose={closeMangaMenu}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
