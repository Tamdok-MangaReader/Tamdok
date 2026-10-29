import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, RefreshControl, StyleSheet, View } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import Animated, { useSharedValue } from "react-native-reanimated";
import PagerView from "react-native-pager-view";

import { LibraryCategoryTabs } from "@/components/library/library-category-tabs";
import { LibraryMangaActionsMenu } from "@/components/library/library-manga-actions-menu";
import { MangaGrid, type MangaGridItem } from "@/components/manga/manga-grid";
import { IncognitoModeBanner } from "@/components/settings/incognito-mode-banner";
import { EmptyState } from "@/components/ui/empty-state";
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
import { mangaHref } from "@/utils/manga-route";

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
  refreshing: boolean;
  tintColor: string;
  onRefresh: () => void;
  onPressManga: (manga: MangaGridItem) => void;
  onLongPressManga: (manga: MangaGridItem) => void;
};

const LibraryPage = memo(function LibraryPage({
  entries,
  columns,
  refreshing,
  tintColor,
  onRefresh,
  onPressManga,
  onLongPressManga,
}: LibraryPageProps) {
  const isEmpty = entries.length === 0;

  const emptyComponent = useMemo(() => <EmptyBelowTabs />, []);

  const refreshControl = useMemo(
    () =>
      isEmpty ? null : (
        <RefreshControl
          refreshing={false}
          onRefresh={onRefresh}
          tintColor={tintColor}
        />
      ),
    [isEmpty, onRefresh, tintColor],
  );

  return (
    <View collapsable={false} style={styles.root}>
      <MangaGrid
        entries={entries}
        columns={columns}
        showBookmark={false}
        scaleBadges
        scrollEnabled
        ListEmptyComponent={emptyComponent}
        refreshControl={refreshControl}
        onPressManga={onPressManga}
        onLongPressManga={onLongPressManga}
      />
    </View>
  );
});

export default function LibraryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { installed } = useSources();
  const refreshTick = useMangaDataRefresh();
  const headerHeight = useHeaderHeight();

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
      nextCategories,
      storedCategoryId,
      customCategories,
      settings,
      history,
      nextEntries,
    ] = await Promise.all([
      getLibraryCategories(),
      getCurrentCategoryId(),
      hasCustomLibraryCategories(),
      getAppSettings(),
      getHistoryEntries(),
      getLibraryEntries(),
    ]);

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

    setGridColumns(libraryGridColumns(settings.libraryDisplay.gridSize));
    setShowUnreadBadges(settings.libraryDisplay.showUnreadBadges);
    setShowDownloadedBadges(settings.libraryDisplay.showDownloadedBadges);
    setShowLibraryRefreshStatus(
      settings.libraryDisplay.showLibraryRefreshStatus ?? false,
    );
    setSortMode(settings.libraryDisplay.sortMode ?? "unread");
    setLastReadAt(nextLastRead);
    setLibraryCategories(nextCategories);
    setAllEntries(nextEntries);
    setSelectedCategoryId(validCategoryId);
    setShowCategoryTabs(customCategories);

    const showCounts = settings.libraryDisplay.showCategoryCountBadges ?? true;
    const showEmpty =
      settings.libraryDisplay.showEmptyCategoryCountBadges ?? false;

    setCategories(
      nextCategories.map((category) => {
        const count = libraryCategoryCount(nextEntries, category.id);

        return {
          id: category.id,
          label: categoryLabel(category.id, category.name),
          count: !showCounts || (count === 0 && !showEmpty) ? undefined : count,
        };
      }),
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
        ? allEntries
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
      if (!source) return;

      router.navigate(mangaHref(sourceRouteId(source), manga));
    },
    [installed, router],
  );

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

  const categoryTabs =
    showCategoryTabs && categories.length > 0 ? (
      <LibraryCategoryTabs
        key={pagerKey}
        tabs={categories}
        progress={progress}
        onPress={handleTabPress}
      />
    ) : null;

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
      {categoryTabs}
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

      {isEmpty && !showCategoryTabs ? (
        <ScreenContent centerContent={!refreshing} scrollable={refreshing}>
          {refreshStatus}
          {emptyState}
        </ScreenContent>
      ) : (
        <View style={styles.root}>
          <View style={{ paddingTop: headerHeight }}>{listHeader}</View>
          <AnimatedPagerView
            ref={pagerRef}
            key={pagerKey}
            style={styles.root}
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
                entries={pagesData.get(category.id) ?? EMPTY_ENTRIES}
                columns={gridColumns}
                refreshing={refreshing}
                tintColor={colors.tint}
                onRefresh={handleRefresh}
                onPressManga={handlePressManga}
                onLongPressManga={openMangaMenu}
              />
            ))}
          </AnimatedPagerView>
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
