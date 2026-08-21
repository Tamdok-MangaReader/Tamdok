import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, View } from 'react-native';

import { MangaDetailHeaderLeft, MangaDetailHeaderRight } from '@/components/manga/manga-detail-header';
import { MangaDetailView } from '@/components/manga/manga-detail-view';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenContent } from '@/components/ui/screen-content';
import { t } from '@/constants/locales';
import { Spacing } from '@/constants/theme';
import { useSources } from '@/context/sources-context';
import { SourceCoverHeadersProvider } from '@/context/source-cover-context';
import { useMangaDataRefresh } from '@/hooks/use-manga-data';
import { useMangaDetail } from '@/hooks/use-manga-detail';
import { useSourceRunner } from '@/hooks/use-source-runner';
import type { Chapter } from '@/parsers/shared/types';
import { getMangaDownloads, queueChapterDownload, removeMangaDownloads, type DownloadEntry } from '@/services/downloads';
import { processQueuedDownloads } from '@/services/download-processor';
import { ALL_CATEGORY_ID, getLibraryCategories, getLibraryEntry, isInLibrary, toggleMangaLibraryCategory, type LibraryCategory } from '@/services/library';
import {
  getMangaChapterProgress,
  markAllChaptersRead,
  markAllChaptersUnread,
  markChapterRead,
  markChapterUnread,
  type ChapterProgress,
} from '@/services/manga-tracking';
import { findInstalledSource, parseSourceRouteId, sourceRouteId } from '@/services/sources';
import { chaptersOldestFirst, formatChapterLabel } from '@/utils/chapter-label';
import { subscribeMangaData } from '@/utils/manga-events';
import { mangaFromParams, readerHref } from '@/utils/manga-route';
import { resolveMangaPageUrl } from '@/utils/manga-url';

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  refreshIndicator: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function decodeParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function resolveReadingTarget(
  chapters: Chapter[],
  progressMap: Record<string, ChapterProgress>,
): { chapter: Chapter; page: number; hasHistory: boolean } | null {
  if (chapters.length === 0) return null;

  const ascending = [...chapters].reverse();
  const resume = Object.values(progressMap).sort((a, b) => b.dateRead - a.dateRead)[0];

  if (!resume) {
    return { chapter: ascending[0]!, page: 0, hasHistory: false };
  }

  const chapter = chapters.find((item) => item.key === resume.chapterKey) ?? ascending[0]!;
  const page = resume.page >= 0 && resume.page !== -1 ? resume.page : 0;
  return { chapter, page, hasHistory: true };
}

export default function MangaDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sourceId: string; mangaKey: string; title?: string; cover?: string; url?: string }>();
  const sourceRoute = decodeParam(params.sourceId);
  const mangaKey = decodeParam(params.mangaKey);
  const { installed } = useSources();
  const source = findInstalledSource(installed, sourceRoute);
  const manifestSourceId = source?.id ?? sourceRoute;
  const cacheSourceId = source?.id ?? parseSourceRouteId(sourceRoute).id;
  const { runner, error } = useSourceRunner(source);
  const refreshTick = useMangaDataRefresh();
  const initialManga = useMemo(
    () => mangaFromParams(manifestSourceId, mangaKey, decodeParam(params.title), decodeParam(params.cover), decodeParam(params.url)),
    [manifestSourceId, mangaKey, params.title, params.cover, params.url],
  );
  const { manga, isLoading, isRefreshing, loadError, hasCachedContent, refresh, dismissError } = useMangaDetail({
    source,
    runner,
    initialManga,
    cacheSourceId,
  });
  const [inLibrary, setInLibraryState] = useState(false);
  const [chapterProgressMap, setChapterProgressMap] = useState<Record<string, ChapterProgress>>({});
  const [readChapterKeys, setReadChapterKeys] = useState<Set<string>>(new Set());
  const [chapterDownloads, setChapterDownloads] = useState<Record<string, DownloadEntry>>({});
  const [downloadedChapterKeys, setDownloadedChapterKeys] = useState<Set<string>>(new Set());
  const [libraryCategories, setLibraryCategories] = useState<LibraryCategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [chapterSelectMode, setChapterSelectMode] = useState(false);
  const [selectedChapterKeys, setSelectedChapterKeys] = useState<Set<string>>(new Set());

  const handlersRef = useRef({
    onCancelSelect: () => {},
    onApplySelect: () => {},
    onShare: () => {},
    onSelectChapters: () => setChapterSelectMode(true),
    onMarkAllRead: () => {},
    onMarkAllUnread: () => {},
    onMarkSelectedRead: () => {},
    onMarkSelectedUnread: () => {},
    onSelectAll: () => {},
    onDeselectAll: () => {},
    onRefresh: () => {},
    onDownloadAll: () => {},
    onDownloadSelected: () => {},
    onRemoveDownloads: () => {},
  });
  const chapterSelectModeRef = useRef(chapterSelectMode);
  const selectedChapterKeysRef = useRef(selectedChapterKeys);
  const inLibraryRef = useRef(inLibrary);
  chapterSelectModeRef.current = chapterSelectMode;
  selectedChapterKeysRef.current = selectedChapterKeys;
  inLibraryRef.current = inLibrary;

  const mangaPageUrl = useMemo(() => (source ? resolveMangaPageUrl(manga, source.manifest.info.url) : undefined), [manga, source]);

  const refreshDownloads = useCallback(async () => {
    const downloads = await getMangaDownloads(manifestSourceId, mangaKey);
    const nextMap: Record<string, DownloadEntry> = {};
    for (const entry of downloads) {
      nextMap[entry.chapterKey] = entry;
    }
    setChapterDownloads(nextMap);
    setDownloadedChapterKeys(new Set(downloads.filter((entry) => entry.status === 'completed').map((entry) => entry.chapterKey)));
  }, [manifestSourceId, mangaKey]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [library, progress, categories, entry] = await Promise.all([
        isInLibrary(manifestSourceId, mangaKey),
        getMangaChapterProgress(manifestSourceId, mangaKey),
        getLibraryCategories(),
        getLibraryEntry(manifestSourceId, mangaKey),
      ]);
      if (cancelled) return;
      setInLibraryState(library);
      setChapterProgressMap(progress);
      setReadChapterKeys(
        new Set(
          Object.values(progress)
            .filter((entry) => entry.page === -1)
            .map((entry) => entry.chapterKey),
        ),
      );
      setLibraryCategories(categories);
      setSelectedCategoryIds(entry?.categoryIds ?? []);
      await refreshDownloads();
    };

    if (hasCachedContent) {
      const timer = setTimeout(() => {
        void load();
      }, 1);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [manifestSourceId, mangaKey, refreshDownloads, hasCachedContent]);

  useEffect(() => {
    let cancelled = false;
    void getLibraryCategories().then((categories) => {
      if (!cancelled) setLibraryCategories(categories);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const chapters = useMemo(() => [...(manga.chapters ?? [])].sort((a, b) => (b.chapterNumber ?? 0) - (a.chapterNumber ?? 0)), [manga.chapters]);

  const chapterKeys = useMemo(() => chapters.map((chapter) => chapter.key), [chapters]);

  const readingTarget = useMemo(() => resolveReadingTarget(chapters, chapterProgressMap), [chapters, chapterProgressMap]);

  const continueLabel = useMemo(() => {
    if (!readingTarget) return t('manga_start_reading');
    if (!readingTarget.hasHistory) return t('manga_start_reading');
    return t('manga_continue_reading', { chapter: formatChapterLabel(readingTarget.chapter) });
  }, [readingTarget]);

  const openChapter = useCallback(
    (chapter: Chapter, initialPage?: number) => {
      if (!source) return;
      const saved = chapterProgressMap[chapter.key];
      const page = initialPage ?? (saved && saved.page >= 0 ? saved.page : 0);
      router.navigate(readerHref(sourceRouteId(source), mangaKey, chapter.key, formatChapterLabel(chapter), manga.title, page, manga.cover));
    },
    [chapterProgressMap, router, source, mangaKey, manga.title, manga.cover],
  );

  const refreshProgress = useCallback(async () => {
    const progress = await getMangaChapterProgress(manifestSourceId, mangaKey);
    setChapterProgressMap(progress);
    setReadChapterKeys(
      new Set(
        Object.values(progress)
          .filter((entry) => entry.page === -1)
          .map((entry) => entry.chapterKey),
      ),
    );
  }, [manifestSourceId, mangaKey]);

  useEffect(() => {
    void refreshDownloads();
  }, [refreshDownloads, refreshTick]);

  useFocusEffect(
    useCallback(() => {
      void refreshProgress();
      return subscribeMangaData(() => {
        void refreshProgress();
      });
    }, [refreshProgress]),
  );

  const handleMarkChapterRead = useCallback(
    (chapter: Chapter) => {
      setReadChapterKeys((previous) => {
        const next = new Set(previous);
        next.add(chapter.key);
        return next;
      });
      void markChapterRead(manifestSourceId, mangaKey, chapter.key, {
        mangaTitle: manga.title,
        chapterTitle: formatChapterLabel(chapter),
        cover: manga.cover,
      }).then(() => refreshProgress());
    },
    [manifestSourceId, mangaKey, manga.title, manga.cover, refreshProgress],
  );

  const handleMarkChapterUnread = useCallback(
    (chapter: Chapter) => {
      setReadChapterKeys((previous) => {
        const next = new Set(previous);
        next.delete(chapter.key);
        return next;
      });
      setChapterProgressMap((previous) => {
        const next = { ...previous };
        delete next[chapter.key];
        return next;
      });
      void markChapterUnread(manifestSourceId, mangaKey, chapter.key).then(() => refreshProgress());
    },
    [manifestSourceId, mangaKey, refreshProgress],
  );

  const handleToggleLibraryPicker = useCallback(() => {
    setLibraryPickerOpen((value) => !value);
  }, []);

  const handleToggleCategory = useCallback(
    (categoryId: string) => {
      setSelectedCategoryIds((previous) => {
        const next = previous.includes(categoryId) ? previous.filter((id) => id !== categoryId) : [...previous, categoryId];
        return next;
      });
      setInLibraryState(true);
      if (libraryCategories.some((category) => category.id !== ALL_CATEGORY_ID)) {
        setLibraryPickerOpen(true);
      }

      void toggleMangaLibraryCategory(manifestSourceId, mangaKey, categoryId, {
        title: manga.title,
        cover: manga.cover,
        unreadCount: chapters.filter((chapter) => !readChapterKeys.has(chapter.key)).length,
        downloadedCount: downloadedChapterKeys.size,
        knownChapterKeys: chapterKeys,
        status: manga.status,
      }).then((result) => {
        setInLibraryState(result.inLibrary);
        setSelectedCategoryIds(result.categoryIds);
        if (!result.inLibrary) {
          setLibraryPickerOpen(false);
        }
      });
    },
    [manifestSourceId, mangaKey, manga.title, manga.cover, manga.status, chapters, readChapterKeys, downloadedChapterKeys, chapterKeys, libraryCategories],
  );

  const handleOpenInBrowser = useCallback(() => {
    if (!mangaPageUrl) return;
    void WebBrowser.openBrowserAsync(mangaPageUrl);
  }, [mangaPageUrl]);

  const handleShare = useCallback(() => {
    if (!mangaPageUrl) return;
    void Share.share({ message: mangaPageUrl, url: mangaPageUrl, title: manga.title });
  }, [mangaPageUrl, manga.title]);

  const handleContinueReading = useCallback(() => {
    if (!readingTarget) return;
    openChapter(readingTarget.chapter, readingTarget.page);
  }, [openChapter, readingTarget]);

  const handleMarkAllRead = useCallback(async () => {
    await markAllChaptersRead(manifestSourceId, mangaKey, chapterKeys, {
      mangaTitle: manga.title,
      cover: manga.cover,
    });
    await refreshProgress();
  }, [manifestSourceId, mangaKey, chapterKeys, manga.title, manga.cover, refreshProgress]);

  const handleMarkAllUnread = useCallback(async () => {
    await markAllChaptersUnread(manifestSourceId, mangaKey, chapterKeys);
    await refreshProgress();
  }, [manifestSourceId, mangaKey, chapterKeys, refreshProgress]);

  const handleDownloadAll = useCallback(async () => {
    if (!inLibraryRef.current) {
      Alert.alert(t('manga_download_requires_library'));
      return;
    }
    for (const chapter of chaptersOldestFirst(chapters)) {
      await queueChapterDownload({
        sourceId: manifestSourceId,
        mangaKey,
        chapterKey: chapter.key,
        mangaTitle: manga.title,
        chapterTitle: formatChapterLabel(chapter),
      });
    }
    void processQueuedDownloads(installed);
    await refreshDownloads();
    Alert.alert(t('manga_download_all'), t('manga_download_all_queued'));
  }, [chapters, installed, manifestSourceId, mangaKey, manga.title, refreshDownloads]);

  const handleRemoveDownloads = useCallback(async () => {
    await removeMangaDownloads(manifestSourceId, mangaKey);
    setChapterDownloads({});
    setDownloadedChapterKeys(new Set());
  }, [manifestSourceId, mangaKey]);

  const exitChapterSelectMode = useCallback(() => {
    setChapterSelectMode(false);
    setSelectedChapterKeys(new Set());
  }, []);

  const handleDownloadSelected = useCallback(async () => {
    const selected = new Set(selectedChapterKeysRef.current);
    exitChapterSelectMode();
    if (selected.size === 0) return;
    if (!inLibraryRef.current) {
      Alert.alert(t('manga_download_requires_library'));
      return;
    }

    for (const chapter of chaptersOldestFirst(chapters)) {
      if (!selected.has(chapter.key)) continue;
      await queueChapterDownload({
        sourceId: manifestSourceId,
        mangaKey,
        chapterKey: chapter.key,
        mangaTitle: manga.title,
        chapterTitle: formatChapterLabel(chapter),
      });
    }
    void processQueuedDownloads(installed);
    await refreshDownloads();
    Alert.alert(t('manga_download_selected'), t('manga_download_all_queued'));
  }, [chapters, installed, manifestSourceId, mangaKey, manga.title, exitChapterSelectMode, refreshDownloads]);

  const toggleChapterSelected = useCallback((chapter: Chapter) => {
    setSelectedChapterKeys((previous) => {
      const next = new Set(previous);
      if (next.has(chapter.key)) next.delete(chapter.key);
      else next.add(chapter.key);
      return next;
    });
  }, []);

  const handleBulkMarkRead = useCallback(async () => {
    for (const chapterKey of selectedChapterKeys) {
      await markChapterRead(manifestSourceId, mangaKey, chapterKey, {
        mangaTitle: manga.title,
        cover: manga.cover,
      });
    }
    await refreshProgress();
    exitChapterSelectMode();
  }, [selectedChapterKeys, manifestSourceId, mangaKey, manga.title, manga.cover, refreshProgress, exitChapterSelectMode]);

  const handleBulkMarkUnread = useCallback(async () => {
    for (const chapterKey of selectedChapterKeys) {
      await markChapterUnread(manifestSourceId, mangaKey, chapterKey);
    }
    await refreshProgress();
    exitChapterSelectMode();
  }, [selectedChapterKeys, manifestSourceId, mangaKey, refreshProgress, exitChapterSelectMode]);

  handlersRef.current = {
    onCancelSelect: exitChapterSelectMode,
    onApplySelect: exitChapterSelectMode,
    onShare: handleShare,
    onSelectChapters: () => setChapterSelectMode(true),
    onMarkAllRead: () => void handleMarkAllRead(),
    onMarkAllUnread: () => void handleMarkAllUnread(),
    onMarkSelectedRead: () => void handleBulkMarkRead(),
    onMarkSelectedUnread: () => void handleBulkMarkUnread(),
    onSelectAll: () => setSelectedChapterKeys(new Set(chapterKeys)),
    onDeselectAll: () => setSelectedChapterKeys(new Set()),
    onRefresh: () => refresh(),
    onDownloadAll: () => void handleDownloadAll(),
    onDownloadSelected: () => void handleDownloadSelected(),
    onRemoveDownloads: () => void handleRemoveDownloads(),
  };

  const headerRight = useCallback(
    () => (
      <View style={styles.headerActions}>
        {isRefreshing ? (
          <View style={styles.refreshIndicator}>
            <ActivityIndicator size='small' />
          </View>
        ) : null}
        <MangaDetailHeaderRight
          chapterSelectMode={chapterSelectMode}
          hasDownloads={downloadedChapterKeys.size > 0}
          canShare={Boolean(mangaPageUrl)}
          canDownload={inLibrary}
          onApplySelect={() => handlersRef.current.onApplySelect()}
          onShare={() => handlersRef.current.onShare()}
          onSelectChapters={() => handlersRef.current.onSelectChapters()}
          onMarkAllRead={() => handlersRef.current.onMarkAllRead()}
          onMarkAllUnread={() => handlersRef.current.onMarkAllUnread()}
          onMarkSelectedRead={() => handlersRef.current.onMarkSelectedRead()}
          onMarkSelectedUnread={() => handlersRef.current.onMarkSelectedUnread()}
          onSelectAll={() => handlersRef.current.onSelectAll()}
          onDeselectAll={() => handlersRef.current.onDeselectAll()}
          onRefresh={() => handlersRef.current.onRefresh()}
          onDownloadAll={() => handlersRef.current.onDownloadAll()}
          onDownloadSelected={() => handlersRef.current.onDownloadSelected()}
          onRemoveDownloads={() => handlersRef.current.onRemoveDownloads()}
        />
      </View>
    ),
    [chapterSelectMode, downloadedChapterKeys.size, inLibrary, isRefreshing, mangaPageUrl],
  );

  const headerLeft = useCallback(
    () => (
      <MangaDetailHeaderLeft chapterSelectMode={chapterSelectMode} onBack={() => router.back()} onCancelSelect={() => handlersRef.current.onCancelSelect()} />
    ),
    [chapterSelectMode, router],
  );

  const screenOptions = useMemo(
    () => ({
      title: chapterSelectMode ? t('manga_select_chapters') : manga.title,
      headerBackVisible: false as const,
      headerLeft,
      headerRight,
    }),
    [chapterSelectMode, headerLeft, headerRight, manga.title],
  );

  const combinedError = error ?? loadError;
  const hasDisplayContent =
    hasCachedContent || Boolean(manga.title?.trim()) || Boolean(manga.cover) || Boolean(manga.description?.trim()) || (manga.chapters?.length ?? 0) > 0;
  const showBlockingError = Boolean(combinedError) && !hasDisplayContent && !isLoading;
  const showInlineError = Boolean(combinedError) && !showBlockingError;
  const showInitialLoading = isLoading && !hasCachedContent && !hasDisplayContent;
  const showChapterLoading = isLoading && chapters.length === 0;

  if (!source) {
    return (
      <>
        <Stack.Screen options={{ title: t('sources_not_found') }} />
        <ScreenContent>
          <EmptyState icon='alert-circle-outline' title={t('sources_not_found')} />
        </ScreenContent>
      </>
    );
  }

  if (showBlockingError) {
    return (
      <SourceCoverHeadersProvider source={source}>
        <Stack.Screen
          options={{
            title: manga.title,
            headerBackVisible: false,
            headerLeft,
          }}
        />
        <ScreenContent centerContent>
          <EmptyState icon='alert-circle-outline' title={t('sources_load_error_title')} description={combinedError!} />
        </ScreenContent>
      </SourceCoverHeadersProvider>
    );
  }

  if (showInitialLoading) {
    return (
      <SourceCoverHeadersProvider source={source}>
        <Stack.Screen
          options={{
            title: manga.title,
            headerBackVisible: false,
            headerLeft,
          }}
        />
        <ScreenContent centerContent>
          <ActivityIndicator />
        </ScreenContent>
      </SourceCoverHeadersProvider>
    );
  }

  return (
    <SourceCoverHeadersProvider source={source}>
      <Stack.Screen options={screenOptions} />
      <MangaDetailView
        manga={manga}
        sourceName={source.manifest.info.name}
        sourceKind={source.kind}
        chapters={chapters}
        readChapterKeys={readChapterKeys}
        chapterDownloads={chapterDownloads}
        downloadedChapterKeys={downloadedChapterKeys}
        inLibrary={inLibrary}
        libraryCategories={libraryCategories}
        selectedCategoryIds={selectedCategoryIds}
        libraryPickerOpen={libraryPickerOpen}
        canOpenInBrowser={Boolean(mangaPageUrl)}
        continueLabel={continueLabel}
        chapterSelectMode={chapterSelectMode}
        selectedChapterKeys={selectedChapterKeys}
        inlineError={showInlineError ? combinedError : null}
        onDismissInlineError={dismissError}
        isLoading={showChapterLoading}
        isRefreshing={isRefreshing}
        onOpenChapter={openChapter}
        onContinueReading={handleContinueReading}
        onToggleLibraryPicker={handleToggleLibraryPicker}
        onToggleCategory={handleToggleCategory}
        onOpenInBrowser={handleOpenInBrowser}
        onMarkChapterRead={(chapter) => void handleMarkChapterRead(chapter)}
        onMarkChapterUnread={(chapter) => void handleMarkChapterUnread(chapter)}
        onToggleChapterSelected={toggleChapterSelected}
        onSelectAllChapters={() => setSelectedChapterKeys(new Set(chapterKeys))}
        onDeselectAllChapters={() => setSelectedChapterKeys(new Set())}
        onRefresh={refresh}
      />
    </SourceCoverHeadersProvider>
  );
}
