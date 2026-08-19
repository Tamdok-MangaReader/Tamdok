import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { LibraryMangaActionsMenu } from '@/components/library/library-manga-actions-menu';
import { MangaGrid, type MangaGridItem } from '@/components/manga/manga-grid';
import { IncognitoModeBanner } from '@/components/settings/incognito-mode-banner';
import { SourceCategoryTabs } from '@/components/sources/source-category-tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { HeaderIconButton } from '@/components/ui/header-icon-button';
import { ScreenContent } from '@/components/ui/screen-content';
import { ThemedText } from '@/components/ui/themed-text';
import { t } from '@/constants/locales';
import { Spacing } from '@/constants/theme';
import { useSources } from '@/context/sources-context';
import { useMangaDataRefresh } from '@/hooks/use-manga-data';
import { useTheme } from '@/hooks/use-theme';
import { refreshLibraryEntries, type LibraryRefreshProgress } from '@/services/library-refresh';
import { subscribeLibraryRefreshProgress } from '@/services/library-refresh-progress';
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
} from '@/services/library';
import { getAppSettings, libraryGridColumns, type LibrarySortMode } from '@/services/app-settings';
import { getHistoryEntries, markAllChaptersRead, markAllChaptersUnread } from '@/services/manga-tracking';
import { subscribeAppSettings } from '@/utils/app-settings-events';
import { findInstalledSource, sourceRouteId } from '@/services/sources';
import { mangaHref } from '@/utils/manga-route';

function categoryLabel(id: string, name: string): string {
  if (isAllCategory(id)) return t('library_category_all');
  return name;
}

export default function LibraryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { installed } = useSources();
  const refreshTick = useMangaDataRefresh();
  const [categories, setCategories] = useState<{ id: string; label: string; count?: number }[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(ALL_CATEGORY_ID);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [showCategoryTabs, setShowCategoryTabs] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<LibraryRefreshProgress | null>(null);
  const [gridColumns, setGridColumns] = useState(3);
  const [showUnreadBadges, setShowUnreadBadges] = useState(true);
  const [showDownloadedBadges, setShowDownloadedBadges] = useState(true);
  const [showLibraryRefreshStatus, setShowLibraryRefreshStatus] = useState(false);
  const [sortMode, setSortMode] = useState<LibrarySortMode>('unread');
  const [lastReadAt, setLastReadAt] = useState<Map<string, number>>(() => new Map());
  const [libraryCategories, setLibraryCategories] = useState<LibraryCategory[]>([]);
  const [menuEntry, setMenuEntry] = useState<LibraryEntry | null>(null);
  const menuEntryRef = useRef<LibraryEntry | null>(null);
  menuEntryRef.current = menuEntry;

  const loadLibrary = useCallback(async () => {
    const [nextCategories, currentCategoryId, customCategories, settings, history, allEntries] = await Promise.all([
      getLibraryCategories(),
      getCurrentCategoryId(),
      hasCustomLibraryCategories(),
      getAppSettings(),
      getHistoryEntries(),
      getLibraryEntries(),
    ]);
    const nextEntries = isAllCategory(currentCategoryId)
      ? allEntries
      : allEntries.filter((entry) => entry.categoryIds.includes(currentCategoryId));
    const nextLastRead = new Map<string, number>();
    for (const item of history) {
      const key = `${item.sourceId}:${item.mangaKey}`;
      if (!nextLastRead.has(key)) nextLastRead.set(key, item.dateRead);
    }
    setGridColumns(libraryGridColumns(settings.libraryDisplay.gridSize));
    setShowUnreadBadges(settings.libraryDisplay.showUnreadBadges);
    setShowDownloadedBadges(settings.libraryDisplay.showDownloadedBadges);
    setShowLibraryRefreshStatus(settings.libraryDisplay.showLibraryRefreshStatus ?? false);
    setSortMode(settings.libraryDisplay.sortMode ?? 'unread');
    setLastReadAt(nextLastRead);
    setLibraryCategories(nextCategories);
    setCategories(
      nextCategories.map((category) => {
        const count = libraryCategoryCount(allEntries, category.id);
        const showCounts = settings.libraryDisplay.showCategoryCountBadges ?? true;
        const showEmpty = settings.libraryDisplay.showEmptyCategoryCountBadges ?? false;
        return {
          id: category.id,
          label: categoryLabel(category.id, category.name),
          count: !showCounts || (count === 0 && !showEmpty) ? undefined : count,
        };
      }),
    );
    setSelectedCategoryId(currentCategoryId);
    setEntries(nextEntries);
    setShowCategoryTabs(customCategories);
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary, refreshTick]);

  useEffect(() => subscribeAppSettings(() => void loadLibrary()), [loadLibrary]);
  useEffect(() => subscribeLibraryRefreshProgress(setRefreshProgress), []);

  const selectCategory = async (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    await setCurrentCategoryId(categoryId);
    setEntries(await getLibraryEntries(categoryId));
  };

  const selectCategoryRef = useRef(selectCategory);
  const categoriesRef = useRef(categories);
  const selectedCategoryIdRef = useRef(selectedCategoryId);
  selectCategoryRef.current = selectCategory;
  categoriesRef.current = categories;
  selectedCategoryIdRef.current = selectedCategoryId;

  const swipeCategory = useCallback((direction: 1 | -1) => {
    const tabs = categoriesRef.current;
    const index = tabs.findIndex((tab) => tab.id === selectedCategoryIdRef.current);
    const nextIndex = index + direction;
    const next = tabs[nextIndex];
    if (!next) return;
    void Haptics.selectionAsync();
    void selectCategoryRef.current(next.id);
  }, []);

  const refreshLibrary = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshLibraryEntries(installed, selectedCategoryId);
      await loadLibrary();
    } finally {
      setRefreshing(false);
    }
  }, [installed, selectedCategoryId, loadLibrary]);

  const mangaEntries = useMemo(
    (): MangaGridItem[] =>
      sortLibraryEntries(entries, sortMode, lastReadAt).map((entry) => ({
        key: entry.mangaKey,
        title: entry.title,
        cover: entry.cover,
        sourceId: entry.sourceId,
        inLibrary: true,
        unreadCount: showUnreadBadges ? entry.unreadCount ?? 0 : 0,
        downloadedCount: showDownloadedBadges ? entry.downloadedCount ?? 0 : 0,
        updateFailed: Boolean(entry.updateFailed),
      })),
    [entries, lastReadAt, showDownloadedBadges, showUnreadBadges, sortMode],
  );

  const openManga = (manga: MangaGridItem, entry: LibraryEntry) => {
    const source = findInstalledSource(installed, entry.sourceId);
    if (!source) return;
    router.push(mangaHref(sourceRouteId(source), manga));
  };

  const openMangaMenu = useCallback((manga: MangaGridItem) => {
    const entry = entries.find((item) => item.mangaKey === manga.key);
    if (!entry) return;
    setMenuEntry(entry);
  }, [entries]);

  const closeMangaMenu = useCallback(() => {
    setMenuEntry(null);
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    const entry = menuEntryRef.current;
    if (!entry) return;
    const keys = chapterKeysForLibraryEntry(entry);
    if (keys.length === 0) {
      Alert.alert(t('library_mark_chapters'), t('library_no_chapters_to_mark'));
      return;
    }
    await markAllChaptersRead(entry.sourceId, entry.mangaKey, keys, {
      mangaTitle: entry.title,
      cover: entry.cover,
    });
    await updateLibraryEntryMetadata(entry.sourceId, entry.mangaKey, { unreadCount: 0 });
  }, []);

  const handleMarkAllUnread = useCallback(async () => {
    const entry = menuEntryRef.current;
    if (!entry) return;
    const keys = chapterKeysForLibraryEntry(entry);
    if (keys.length === 0) {
      Alert.alert(t('library_mark_chapters'), t('library_no_chapters_to_mark'));
      return;
    }
    await markAllChaptersUnread(entry.sourceId, entry.mangaKey, keys);
    await updateLibraryEntryMetadata(entry.sourceId, entry.mangaKey, { unreadCount: keys.length });
  }, []);

  const handleToggleCategory = useCallback(async (categoryId: string) => {
    const entry = menuEntryRef.current;
    if (!entry) return;
    const result = await toggleMangaLibraryCategory(entry.sourceId, entry.mangaKey, categoryId, {
      title: entry.title,
      cover: entry.cover,
      unreadCount: entry.unreadCount,
      downloadedCount: entry.downloadedCount,
      knownChapterKeys: entry.knownChapterKeys,
      status: entry.status,
    });
    if (!result.inLibrary) {
      setMenuEntry(null);
      return;
    }
    setMenuEntry((current) => (current ? { ...current, categoryIds: result.categoryIds } : current));
  }, []);

  const handleDeleteManga = useCallback(() => {
    const entry = menuEntryRef.current;
    if (!entry) return;
    Alert.alert(t('manga_remove_from_library'), entry.title, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('manga_remove_from_library'),
        style: 'destructive',
        onPress: () => {
          setMenuEntry(null);
          void removeFromLibrary(entry.sourceId, entry.mangaKey);
        },
      },
    ]);
  }, []);

  const categoryTabs = showCategoryTabs ? (
    <SourceCategoryTabs tabs={categories} selectedId={selectedCategoryId} onSelect={(id) => void selectCategory(id)} />
  ) : null;

  const emptyState = (
    <EmptyState icon='library-outline' title={t('library_empty_title')} description={t('library_empty_desc')} />
  );

  const isEmpty = mangaEntries.length === 0;

  const refreshStatus =
    showLibraryRefreshStatus && refreshProgress ? (
      <View style={styles.refreshStatus}>
        <ThemedText variant='subheadline' numberOfLines={1} style={styles.refreshText}>
          {refreshProgress.title}
        </ThemedText>
        <ThemedText variant='caption1' color='secondaryLabel' style={styles.refreshText}>
          {t('library_refresh_progress', {
            current: String(refreshProgress.current),
            total: String(refreshProgress.total),
          })}
        </ThemedText>
      </View>
    ) : null;

  const listHeader = (
    <>
      {refreshStatus}
      <IncognitoModeBanner />
      {categoryTabs}
    </>
  );
  const canSwipeCategories = showCategoryTabs && categories.length > 1;

  const categorySwipe = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(canSwipeCategories)
      .activeOffsetX([-32, 32])
      .failOffsetY([-18, 18])
      .onEnd((event) => {
        if (event.translationX <= -56) {
          runOnJS(swipeCategory)(1);
          return;
        }
        if (event.translationX >= 56) {
          runOnJS(swipeCategory)(-1);
        }
      });
    return Gesture.Simultaneous(Gesture.Native(), pan);
  }, [canSwipeCategories, swipeCategory]);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderIconButton
              icon='refresh-outline'
              accessibilityLabel={t('library_refresh_all')}
              onPress={() => void refreshLibrary()}
            />
          ),
        }}
      />
      <Stack.Title>{t('library')}</Stack.Title>
      {isEmpty && !showCategoryTabs ? (
        <ScreenContent centerContent={!refreshing} scrollable={refreshing}>
          {refreshStatus}
          {emptyState}
        </ScreenContent>
      ) : (
        <View style={styles.root}>
          <GestureDetector gesture={categorySwipe}>
            <View style={styles.root}>
              <MangaGrid
            entries={mangaEntries}
            columns={gridColumns}
            showBookmark={false}
            scaleBadges
            extraData={refreshProgress}
            scrollEnabled
            ListHeaderComponent={listHeader}
            ListEmptyComponent={<View style={styles.emptyBelowTabs}>{emptyState}</View>}
            refreshControl={
              isEmpty ? null : (
                <RefreshControl refreshing={refreshing} onRefresh={() => void refreshLibrary()} tintColor={colors.tint} />
              )
            }
            onPressManga={(manga) => {
              const entry = entries.find((item) => item.mangaKey === manga.key);
              if (entry) openManga(manga, entry);
            }}
            onLongPressManga={openMangaMenu}
              />
            </View>
          </GestureDetector>
        </View>
      )}
      <LibraryMangaActionsMenu
        visible={menuEntry != null}
        title={menuEntry?.title ?? ''}
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
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: 2,
  },
  refreshText: {
    textAlign: 'center',
  },
  emptyBelowTabs: {
    paddingTop: Spacing.xl,
  },
});
