import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StatusBar, StyleSheet, useColorScheme, View, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReaderChapterSheet } from '@/components/reader/reader-chapter-sheet';
import { ReaderDictionaryPopup } from '@/components/reader/reader-dictionary-popup';
import { ReaderProvider, type ReaderActions, type ReaderChromeState } from '@/components/reader/reader-context';
import { ReaderNavBar } from '@/components/reader/reader-nav-bar';
import { ReaderPagedView } from '@/components/reader/reader-paged-view';
import { ReaderSettingsSheet } from '@/components/reader/reader-settings-sheet';
import { ReaderTextView } from '@/components/reader/reader-text-view';
import { ReaderToolbar } from '@/components/reader/reader-toolbar';
import { ReaderWebtoonView } from '@/components/reader/reader-webtoon-view';
import { IncognitoModeBanner } from '@/components/settings/incognito-mode-banner';
import { useReaderChapterWindow } from '@/hooks/use-reader-chapter-window';
import type { Chapter, Manga, Page } from '@/parsers/shared/types';
import { getAppSettings } from '@/services/app-settings';
import { removeChapterDownload } from '@/services/downloads';
import { lookupWord, pickWordNearTap, type DictionaryEntry } from '@/services/dictionary-lookup';
import { markChapterRead, recordChapterProgress, getChapterProgress } from '@/services/manga-tracking';
import {
  getMangaPageOffset,
  getMangaReadingMode,
  setMangaPageOffset,
} from '@/services/reader-manga-settings';
import { subscribeAppSettings } from '@/utils/app-settings-events';
import { notifyMangaDataChanged } from '@/utils/manga-events';
import { extractTextFromImage } from 'expo-text-extractor';
import { findAdjacentChapter, findAdjacentChapterWithSkipped } from '@/utils/reader-chapters';
import { readerBackgroundColor, readerForegroundColor } from '@/utils/reader-colors';
import {
  inferReadingModeFromImageSizes,
  isStripMode,
  isTextChapter,
  resolveReadingMode,
  shouldInferModeFromImages,
} from '@/utils/reader-mode';
import { materializeReaderPages, buildReaderPages, type ReaderPage } from '@/utils/reader-pages';
import { prefetchReaderPagesAhead } from '@/utils/reader-prefetch';
import type { ResolvedReadingMode } from '@/services/app-settings';

type ReaderViewProps = {
  sourceId: string;
  manga: Manga;
  chapter: Chapter;
  chapters: Chapter[];
  pages: Page[];
  initialPage: number;
  coverHeaders?: Record<string, string>;
  loadChapterPages?: (chapter: Chapter) => Promise<Page[]>;
  onStatusBarHiddenChange?: (hidden: boolean) => void;
};

const BARS_IDLE_HIDE_MS = 12_000;

// Native stack reads statusBarHidden from screen options; Android still uses StatusBar API.
function applyStatusBarHidden(
  navigation: { setOptions: (options: object) => void },
  hidden: boolean,
) {
  navigation.setOptions({
    statusBarHidden: hidden,
    statusBarAnimation: 'fade',
    autoHideHomeIndicator: hidden,
  });
}

export function ReaderView({
  sourceId,
  manga,
  chapter,
  chapters,
  pages,
  initialPage,
  coverHeaders,
  loadChapterPages,
  onStatusBarHiddenChange,
}: ReaderViewProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getAppSettings>>['reader'] | null>(null);
  const [dictionarySettings, setDictionarySettings] = useState<
    Awaited<ReturnType<typeof getAppSettings>>['dictionary'] | null
  >(null);
  const [mangaModeOverride, setMangaModeOverride] = useState<Awaited<ReturnType<typeof getMangaReadingMode>>>(null);
  const [mangaPageOffsetOverride, setMangaPageOffsetOverride] = useState<boolean | null>(null);
  const [incognito, setIncognito] = useState(false);
  const [debugShowPageNumbers, setDebugShowPageNumbers] = useState(false);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [activeChapter, setActiveChapter] = useState(chapter);
  const [barsVisible, setBarsVisible] = useState(true);
  const barsIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBarsIdleTimer = useCallback(() => {
    if (!barsIdleTimerRef.current) return;
    clearTimeout(barsIdleTimerRef.current);
    barsIdleTimerRef.current = null;
  }, []);

  const scheduleBarsIdleHide = useCallback(() => {
    clearBarsIdleTimer();
    barsIdleTimerRef.current = setTimeout(() => {
      setBarsVisible(false);
      barsIdleTimerRef.current = null;
    }, BARS_IDLE_HIDE_MS);
  }, [clearBarsIdleTimer]);

  const hideBars = useCallback(() => {
    clearBarsIdleTimer();
    setBarsVisible(false);
  }, [clearBarsIdleTimer]);

  useEffect(() => {
    if (barsVisible) scheduleBarsIdleHide();
    else clearBarsIdleTimer();
    return clearBarsIdleTimer;
  }, [barsVisible, clearBarsIdleTimer, scheduleBarsIdleHide]);
  const [chapterSheetOpen, setChapterSheetOpen] = useState(false);
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false);
  const [readerPages, setReaderPages] = useState<ReaderPage[]>([]);
  const [inferredMode, setInferredMode] = useState<ResolvedReadingMode | null>(null);
  const [chaptersToMark, setChaptersToMark] = useState<Chapter[]>([chapter]);
  const [dictionaryEntry, setDictionaryEntry] = useState<DictionaryEntry | null>(null);
  const [dictionaryLoading, setDictionaryLoading] = useState(false);
  const [dictionaryVisible, setDictionaryVisible] = useState(false);
  const goToPageRef = useRef<(index: number, animated?: boolean) => void>(() => {});
  const restorePageRef = useRef(initialPage);
  const currentPageRef = useRef(currentPage);
  const activeChapterRef = useRef(activeChapter);
  const pageCountRef = useRef(0);
  const persistProgressRef = useRef<
    (targetChapter: Chapter, pageIndex: number, pageCount: number, notify?: boolean) => Promise<void>
  >(async () => {});
  currentPageRef.current = currentPage;
  activeChapterRef.current = activeChapter;

  useEffect(() => {
    setActiveChapter(chapter);
    setCurrentPage(initialPage);
    restorePageRef.current = initialPage;
    const timer = setTimeout(() => {
      restorePageRef.current = 0;
    }, 500);
    return () => clearTimeout(timer);
  }, [chapter.key, initialPage]);

  const pageOffsetEnabled = mangaPageOffsetOverride ?? settings?.pagedPageOffset ?? false;

  useEffect(() => {
    void getAppSettings().then((value) => {
      setSettings(value.reader);
      setDictionarySettings(value.dictionary);
      setIncognito(value.incognitoMode);
      setDebugShowPageNumbers(value.debug.showReaderPageNumbers);
    });
    void getMangaReadingMode(sourceId, manga.key).then(setMangaModeOverride);
    void getMangaPageOffset(sourceId, manga.key).then(setMangaPageOffsetOverride);
    const unsubscribe = subscribeAppSettings(() => {
      void getAppSettings().then((value) => {
        setSettings(value.reader);
        setDictionarySettings(value.dictionary);
        setIncognito(value.incognitoMode);
        setDebugShowPageNumbers(value.debug.showReaderPageNumbers);
      });
    });
    return unsubscribe;
  }, [manga.key, sourceId]);

  useEffect(() => {
    setChaptersToMark([chapter]);
  }, [chapter.key]);

  useEffect(() => {
    if (!settings) return;

    async function applyOrientation() {
      switch (settings!.orientation) {
        case 'portrait':
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          break;
        case 'landscape':
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
          break;
        case 'device':
        default:
          await ScreenOrientation.unlockAsync();
          break;
      }
    }

    void applyOrientation();
    return () => {
      void ScreenOrientation.unlockAsync();
    };
  }, [settings]);

  const statusBarHidden = Boolean(settings?.hideStatusBarWithMenu) && !barsVisible;

  useEffect(() => {
    onStatusBarHiddenChange?.(statusBarHidden);
  }, [onStatusBarHiddenChange, statusBarHidden]);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      applyStatusBarHidden(navigation, statusBarHidden);
      return;
    }
    StatusBar.setHidden(statusBarHidden, 'fade');
    navigation.setOptions({ navigationBarHidden: statusBarHidden });
  }, [navigation, statusBarHidden]);

  useEffect(() => {
    return () => {
      if (Platform.OS === 'ios') {
        applyStatusBarHidden(navigation, false);
        return;
      }
      StatusBar.setHidden(false, 'fade');
      navigation.setOptions({ navigationBarHidden: false });
    };
  }, [navigation]);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    setReaderPages(buildReaderPages(pages, settings, chapter.key));
    void materializeReaderPages(pages, settings, chapter.key, coverHeaders).then((built) => {
      if (!cancelled) setReaderPages(built);
    });

    return () => {
      cancelled = true;
    };
  }, [chapter.key, coverHeaders, pages, settings]);

  const wantsAuto = settings ? shouldInferModeFromImages(settings, mangaModeOverride) : false;

  // Sample first few page URLs so auto mode can pick rtl vs webtoon before full decode.
  useEffect(() => {
    if (!settings || !wantsAuto) {
      setInferredMode(null);
      return;
    }

    const urls = pages.map((page) => page.url).filter((url): url is string => Boolean(url)).slice(0, 4);
    if (urls.length === 0) {
      setInferredMode('rtl');
      return;
    }

    let cancelled = false;
    void Promise.all(
      urls.map(
        (url) =>
          new Promise<{ width: number; height: number }>((resolve) => {
            Image.getSize(
              url,
              (width, height) => resolve({ width, height }),
              () => resolve({ width: 0, height: 0 }),
            );
          }),
      ),
    ).then((sizes) => {
      if (!cancelled) setInferredMode(inferReadingModeFromImageSizes(sizes));
    });

    return () => {
      cancelled = true;
    };
  }, [pages, settings, wantsAuto]);

  const resolvedBase = useMemo(
    () => (settings ? resolveReadingMode(settings, mangaModeOverride, manga.viewer) : 'continuous'),
    [settings, mangaModeOverride, manga.viewer],
  );
  const mode = wantsAuto && inferredMode ? inferredMode : resolvedBase;
  const stripEnabled = isStripMode(mode);
  const { segments, loadAdjacent } = useReaderChapterWindow({
    enabled: stripEnabled,
    routeChapter: chapter,
    chapters,
    initialPages: readerPages,
    settings,
    skipDuplicates: settings?.skipDuplicateChapters ?? true,
    loadChapterPages,
    requestHeaders: coverHeaders,
  });
  const activePages = useMemo(
    () => segments.find((segment) => segment.chapter.key === activeChapter.key)?.pages ?? readerPages,
    [activeChapter.key, readerPages, segments],
  );
  pageCountRef.current = activePages.length;
  const isText = useMemo(() => isTextChapter(pages), [pages]);
  const backgroundColor = useMemo(
    () => (settings ? readerBackgroundColor(settings.backgroundColor, colorScheme) : '#000000'),
    [colorScheme, settings],
  );
  const foregroundColor = useMemo(() => readerForegroundColor(backgroundColor), [backgroundColor]);

  const markChaptersInQueue = useCallback(
    async (chaptersList: Chapter[]) => {
      const seen = new Set<string>();
      for (const item of chaptersList) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        await markChapterRead(sourceId, manga.key, item.key, {
          mangaTitle: manga.title,
          chapterTitle: item.title,
          cover: manga.cover,
          notify: false,
        });
      }
    },
    [manga.cover, manga.key, manga.title, sourceId],
  );

  const persistProgress = useCallback(
    async (targetChapter: Chapter, pageIndex: number, pageCount: number, notify = true) => {
      const historyMeta = {
        mangaTitle: manga.title,
        chapterTitle: targetChapter.title,
        cover: manga.cover,
        notify,
      };
      const isLastPage = pageCount > 0 && pageIndex >= pageCount - 1;
      const existing = await getChapterProgress(sourceId, manga.key, targetChapter.key);
      const alreadyRead = existing?.page === -1;
      if (alreadyRead && !isLastPage) {
        await recordChapterProgress(sourceId, manga.key, targetChapter.key, -1, { ...historyMeta, notify });
        return;
      }
      if (isLastPage) {
        if (settings?.markDuplicateChapters) {
          await markChaptersInQueue(
            chaptersToMark.some((item) => item.key === targetChapter.key)
              ? chaptersToMark
              : [targetChapter, ...chaptersToMark],
          );
        } else {
          await markChapterRead(sourceId, manga.key, targetChapter.key, historyMeta);
        }
        const nextChapter = findAdjacentChapter(
          chapters,
          targetChapter.key,
          'next',
          settings?.skipDuplicateChapters ?? true,
        );
        if (nextChapter) {
          const nextProgress = await getChapterProgress(sourceId, manga.key, nextChapter.key);
          if (nextProgress?.page !== -1) {
            await recordChapterProgress(
              sourceId,
              manga.key,
              nextChapter.key,
              nextProgress && nextProgress.page >= 0 ? nextProgress.page : 0,
              {
                mangaTitle: manga.title,
                chapterTitle: nextChapter.title,
                cover: manga.cover,
                notify,
              },
            );
          }
        }
        const appSettings = await getAppSettings();
        if (appSettings.downloads.deleteAfterReading) {
          await removeChapterDownload(sourceId, manga.key, targetChapter.key);
        }
        return;
      }
      await recordChapterProgress(sourceId, manga.key, targetChapter.key, pageIndex, historyMeta);
    },
    [
      chapters,
      chaptersToMark,
      markChaptersInQueue,
      manga.cover,
      manga.key,
      manga.title,
      settings?.markDuplicateChapters,
      settings?.skipDuplicateChapters,
      sourceId,
    ],
  );
  persistProgressRef.current = persistProgress;

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<{ chapter: Chapter; page: number; count: number } | null>(null);

  const schedulePersist = useCallback((targetChapter: Chapter, pageIndex: number, pageCount: number) => {
    pendingPersistRef.current = { chapter: targetChapter, page: pageIndex, count: pageCount };
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      const pending = pendingPersistRef.current;
      pendingPersistRef.current = null;
      if (!pending) return;
      void persistProgressRef.current(pending.chapter, pending.page, pending.count, false);
    }, 900);
  }, []);

  const openedChapterKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (activePages.length === 0) return;
    if (openedChapterKeyRef.current === chapter.key) return;
    openedChapterKeyRef.current = chapter.key;
    void persistProgressRef.current(
      activeChapterRef.current,
      currentPageRef.current,
      activePages.length,
      false,
    );
  }, [activePages.length, chapter.key]);

  useEffect(() => {
    prefetchReaderPagesAhead(activePages, currentPage, coverHeaders);
  }, [activePages, coverHeaders, currentPage]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      const pending = pendingPersistRef.current;
      pendingPersistRef.current = null;
      void persistProgressRef
        .current(
          pending?.chapter ?? activeChapterRef.current,
          pending?.page ?? currentPageRef.current,
          pending?.count ?? pageCountRef.current,
          false,
        )
        .then(() => {
          setTimeout(() => notifyMangaDataChanged(), 400);
        });
    };
  }, [chapter.key]);

  const handleLocationChange = useCallback(
    (nextChapter: Chapter, pageIndex: number, pageCount: number) => {
      const restoringTo = restorePageRef.current;
      if (nextChapter.key === chapter.key && restoringTo > 0 && pageIndex === 0 && pageIndex !== restoringTo) {
        return;
      }
      if (nextChapter.key === chapter.key && restoringTo > 0 && pageIndex === restoringTo) {
        restorePageRef.current = 0;
      }

      const previous = activeChapterRef.current;
      if (previous.key !== nextChapter.key) {
        const movingForward = findAdjacentChapter(chapters, previous.key, 'next', true)?.key === nextChapter.key;
        if (movingForward) {
          const previousCount =
            segments.find((segment) => segment.chapter.key === previous.key)?.pages.length ?? 0;
          if (previousCount > 0) {
            if (persistTimerRef.current) {
              clearTimeout(persistTimerRef.current);
              persistTimerRef.current = null;
            }
            pendingPersistRef.current = null;
            void persistProgress(previous, previousCount - 1, previousCount, false);
          }
        }
        setActiveChapter(nextChapter);
      }

      setCurrentPage(pageIndex);
      schedulePersist(nextChapter, pageIndex, pageCount);
    },
    [chapter.key, chapters, persistProgress, schedulePersist, segments],
  );

  const handlePageChange = useCallback(
    (index: number) => {
      handleLocationChange(activeChapterRef.current, index, pageCountRef.current);
    },
    [handleLocationChange],
  );

  const navigateChapter = useCallback(
    (nextChapter: Chapter, extraToMark: Chapter[] = []) => {
      if (settings?.markDuplicateChapters && extraToMark.length > 0) {
        void markChaptersInQueue(extraToMark);
      }
      router.replace({
        pathname: '/reader',
        params: {
          sourceId,
          mangaKey: encodeURIComponent(manga.key),
          chapterKey: encodeURIComponent(nextChapter.key),
          chapterTitle: nextChapter.title ?? nextChapter.key,
          mangaTitle: manga.title,
          ...(manga.cover ? { cover: manga.cover } : {}),
        },
      });
    },
    [markChaptersInQueue, manga.cover, manga.key, manga.title, router, settings?.markDuplicateChapters, sourceId],
  );

  const goNextChapter = useCallback(() => {
    if (stripEnabled) {
      void loadAdjacent('next');
      return;
    }
    const result = findAdjacentChapterWithSkipped(
      chapters,
      activeChapterRef.current.key,
      'next',
      settings?.skipDuplicateChapters ?? true,
    );
    if (!result.chapter) return;
    const toMark = settings?.markDuplicateChapters ? result.skippedDuplicates : [];
    setChaptersToMark([result.chapter, ...toMark]);
    navigateChapter(result.chapter, toMark);
  }, [
    chapters,
    loadAdjacent,
    navigateChapter,
    settings?.markDuplicateChapters,
    settings?.skipDuplicateChapters,
    stripEnabled,
  ]);

  const goPreviousChapter = useCallback(() => {
    if (stripEnabled) {
      void loadAdjacent('previous');
      return;
    }
    const result = findAdjacentChapterWithSkipped(
      chapters,
      activeChapterRef.current.key,
      'previous',
      settings?.skipDuplicateChapters ?? true,
    );
    if (!result.chapter) return;
    const toMark = settings?.markDuplicateChapters ? result.skippedDuplicates : [];
    setChaptersToMark([result.chapter, ...toMark]);
    navigateChapter(result.chapter, toMark);
  }, [
    chapters,
    loadAdjacent,
    navigateChapter,
    settings?.markDuplicateChapters,
    settings?.skipDuplicateChapters,
    stripEnabled,
  ]);

  const goNext = useCallback(() => {
    if (currentPage < activePages.length - 1) {
      goToPageRef.current(currentPage + 1, true);
      return;
    }
    goNextChapter();
  }, [activePages.length, currentPage, goNextChapter]);

  const goPrevious = useCallback(() => {
    if (currentPage > 0) {
      goToPageRef.current(currentPage - 1, true);
      return;
    }
    goPreviousChapter();
  }, [currentPage, goPreviousChapter]);

  const togglePageOffset = useCallback(() => {
    const next = !pageOffsetEnabled;
    setMangaPageOffsetOverride(next);
    void setMangaPageOffset(sourceId, manga.key, next);
  }, [manga.key, pageOffsetEnabled, sourceId]);

  const lookupDictionary = useCallback(
    async (pageUrl: string, x: number, y: number, layout: { width: number; height: number }) => {
      if (!dictionarySettings?.enable || !pageUrl) return;
      setDictionaryVisible(true);
      setDictionaryLoading(true);
      setDictionaryEntry(null);
      try {
        const lines = await extractTextFromImage(pageUrl);
        const word = pickWordNearTap(lines.join(' '), x, y, layout.width, layout.height);
        if (!word) {
          setDictionaryEntry(null);
          return;
        }
        const entry = await lookupWord(word);
        setDictionaryEntry(entry);
      } finally {
        setDictionaryLoading(false);
      }
    },
    [dictionarySettings?.enable],
  );

  const actions: ReaderActions = useMemo(
    () => ({
      toggleBars: () => setBarsVisible((value) => !value),
      setBarsVisible,
      goToPage: (index, animated) => {
        restorePageRef.current = 0;
        goToPageRef.current(index, animated);
      },
      goNext,
      goPrevious,
      goNextChapter,
      openChapterList: () => setChapterSheetOpen(true),
      closeReader: () => {
        router.back();
      },
      openChapterUrl: () => {
        if (activeChapter.url) void WebBrowser.openBrowserAsync(activeChapter.url);
      },
      openSettings: () => router.push('/settings/reader'),
      openReaderSettings: () => setReaderSettingsOpen(true),
      selectChapter: (nextChapter) => navigateChapter(nextChapter),
      lookupDictionary,
      loadAdjacentChapter: (direction) => {
        void loadAdjacent(direction);
      },
    }),
    [
      activeChapter.url,
      goNext,
      goNextChapter,
      goPrevious,
      loadAdjacent,
      lookupDictionary,
      navigateChapter,
      router,
    ],
  );

  const chrome: ReaderChromeState = {
    barsVisible,
    currentPage,
    totalPages: activePages.length,
    pagesRemaining: Math.max(0, activePages.length - currentPage - 1),
    chapterTitle: activeChapter.title ?? activeChapter.key,
    mangaTitle: manga.title,
    incognito,
  };

  if (!settings || !dictionarySettings || (!isText && pages.length > 0 && readerPages.length === 0)) {
    return (
      <View style={[styles.root, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color='#fff' />
      </View>
    );
  }

  return (
    <ReaderProvider
      value={{
        manga,
        chapter: activeChapter,
        chapters,
        pages: activePages,
        settings,
        dictionarySettings,
        mode,
        isText,
        backgroundColor,
        foregroundColor,
        coverHeaders,
        chrome,
        actions,
        chapterUrl: activeChapter.url,
        stripSegments: segments,
        debugShowPageNumbers,
      }}>
      <View style={[styles.root, { backgroundColor }]}>
        {Platform.OS === 'android' ? (
          <StatusBar
            hidden={statusBarHidden}
            animated
            barStyle='light-content'
            backgroundColor={backgroundColor}
          />
        ) : null}
        {isText ? (
          <ReaderTextView
            currentPage={currentPage}
            onPageChange={handlePageChange}
            setPageRef={(fn) => {
              goToPageRef.current = fn;
            }}
          />
        ) : stripEnabled ? (
          <ReaderWebtoonView
            key={chapter.key}
            currentPage={currentPage}
            onLocationChange={handleLocationChange}
            onInteraction={hideBars}
            setPageRef={(fn) => {
              goToPageRef.current = fn;
            }}
          />
        ) : (
          <ReaderPagedView
            key={chapter.key}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            onInteraction={hideBars}
            setPageRef={(fn) => {
              goToPageRef.current = fn;
            }}
            pageOffsetEnabled={pageOffsetEnabled}
            onTogglePageOffset={togglePageOffset}
          />
        )}

        {barsVisible ? (
          <>
            <LinearGradient
              pointerEvents='none'
              colors={['#000000', 'rgba(0,0,0,0.45)', 'transparent']}
              locations={[0, 0.55, 1]}
              style={[styles.edgeFade, styles.edgeFadeTop, { height: insets.top + 96 }]}
            />
            <LinearGradient
              pointerEvents='none'
              colors={['transparent', 'rgba(0,0,0,0.45)', '#000000']}
              locations={[0, 0.45, 1]}
              style={[styles.edgeFade, styles.edgeFadeBottom, { height: insets.bottom + 96 }]}
            />
          </>
        ) : null}

        <ReaderNavBar visible={barsVisible} />
        <ReaderToolbar visible={barsVisible} />
        <IncognitoModeBanner floating />
        <ReaderChapterSheet visible={chapterSheetOpen} onClose={() => setChapterSheetOpen(false)} />
        <ReaderSettingsSheet
          visible={readerSettingsOpen}
          sourceId={sourceId}
          mangaReadingMode={mangaModeOverride}
          onClose={() => setReaderSettingsOpen(false)}
          onMangaReadingModeChange={(nextMode) => {
            setMangaModeOverride(nextMode === 'default' ? null : nextMode);
          }}
        />
        <ReaderDictionaryPopup
          visible={dictionaryVisible}
          entry={dictionaryEntry}
          loading={dictionaryLoading}
          displayMode={dictionarySettings.displayMode}
          popupWidth={dictionarySettings.popupWidth}
          popupHeight={dictionarySettings.popupHeight}
          onClose={() => setDictionaryVisible(false)}
        />
      </View>
    </ReaderProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  edgeFade: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  edgeFadeTop: {
    top: 0,
  },
  edgeFadeBottom: {
    bottom: 0,
  },
});
