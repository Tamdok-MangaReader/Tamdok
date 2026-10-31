import { configureReaderDebug } from "@/utils/reader-debug";
import { useNavigation, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import * as WebBrowser from "expo-web-browser";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  Platform,
  Share,
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ReaderChapterSheet } from "@/components/reader/reader-chapter-sheet";
import { ReaderDictionaryPopup } from "@/components/reader/reader-dictionary-popup";
import {
  ReaderProvider,
  type ReaderActions,
  type ReaderChromeState,
} from "@/components/reader/reader-context";
import { ReaderNavBar } from "@/components/reader/reader-nav-bar";
import { ReaderPagedView } from "@/components/reader/reader-paged-view";
import { ReaderSettingsSheet } from "@/components/reader/reader-settings-sheet";
import { ReaderTextView } from "@/components/reader/reader-text-view";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { ReaderWebtoonView } from "@/components/reader/reader-webtoon-view";
import { ReaderModeHint } from "@/components/reader/reader-mode-hint";
import { useReaderChapterWindow } from "@/hooks/use-reader-chapter-window";
import type { Chapter, Manga, Page } from "@/parsers/shared/types";
import { getAppSettings } from "@/services/app-settings";
import { syncReadingLiveActivity } from "@/services/library-live-activity";
import { removeChapterDownload } from "@/services/downloads";
import {
  lookupWord,
  pickWordNearTap,
  type DictionaryEntry,
} from "@/services/dictionary-lookup";
import {
  markChapterRead,
  recordChapterProgress,
  getChapterProgress,
} from "@/services/manga-tracking";
import {
  getMangaAutoResolvedMode,
  getMangaPageOffset,
  getMangaReadingMode,
  setMangaAutoResolvedMode,
  setMangaPageOffset,
} from "@/services/reader-manga-settings";
import {
  getBookmarkedChapterKeys,
  toggleChapterBookmark,
} from "@/services/chapter-bookmarks";
import { subscribeMangaData } from "@/utils/manga-events";
import { subscribeAppSettings } from "@/utils/app-settings-events";
import { notifyMangaDataChanged } from "@/utils/manga-events";
import { extractTextFromImage } from "expo-text-extractor";
import {
  chapterTitleForDisplay,
  formatChapterLabel,
} from "@/utils/chapter-label";
import {
  findAdjacentChapter,
  findAdjacentChapterWithSkipped,
} from "@/utils/reader-chapters";
import {
  readerBackgroundColor,
  readerForegroundColor,
} from "@/utils/reader-colors";
import {
  inferReadingModeFromImageSizes,
  inferReadingModeFromManga,
  isStripMode,
  isTextChapter,
  pagesForAutoModeProbe,
  pickAutoReadingMode,
  resolveReadingMode,
  shouldInferModeFromImages,
} from "@/utils/reader-mode";
import {
  materializeReaderPages,
  buildReaderPages,
  probeReaderImageDimensions,
  type ReaderPage,
} from "@/utils/reader-pages";
import { prefetchReaderPagesAhead } from "@/utils/reader-prefetch";
import { clearDecodedImageCache } from "@/utils/image-memory";
import type { ResolvedReadingMode } from "@/services/app-settings";

const MODE_HINT_MS = 2_200;

type AppSettings = Awaited<ReturnType<typeof getAppSettings>>;
type ReaderSettings = AppSettings["reader"];
type DictionarySettings = AppSettings["dictionary"];
type ReaderValue = ComponentProps<typeof ReaderProvider>["value"];
type PageSetter = (index: number, animated?: boolean) => void;
type ModeChangeHandler = NonNullable<
  ComponentProps<typeof ReaderSettingsSheet>["onMangaReadingModeChange"]
>;

type ReaderViewProps = {
  showModeHint?: boolean;
  mangaPageUrl?: string;
  sourceId: string;
  manga: Manga;
  chapter: Chapter;
  chapters: Chapter[];
  pages: Page[];
  initialPage: number;
  coverHeaders?: Record<string, string>;
  loadChapterPages?: (chapter: Chapter) => Promise<Page[]>;
  onStatusBarHiddenChange?: (hidden: boolean) => void;
  startAtEnd?: boolean;
};

function keepIfEqual<T>(previous: T | null, next: T): T {
  if (previous === null || previous === next) return next;
  return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}

function applyStatusBarHidden(
  navigation: { setOptions: (options: object) => void },
  hidden: boolean,
) {
  navigation.setOptions({
    statusBarHidden: hidden,
    statusBarAnimation: "fade",
    autoHideHomeIndicator: hidden,
  });
}

export function ReaderView({
  showModeHint = true,
  mangaPageUrl,
  sourceId,
  manga,
  chapter,
  chapters,
  pages,
  initialPage,
  coverHeaders,
  loadChapterPages,
  onStatusBarHiddenChange,
  startAtEnd,
}: ReaderViewProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<ReaderSettings | null>(null);
  const [dictionarySettings, setDictionarySettings] =
    useState<DictionarySettings | null>(null);
  const [mangaModeOverride, setMangaModeOverride] =
    useState<Awaited<ReturnType<typeof getMangaReadingMode>>>(null);
  const [mangaPageOffsetOverride, setMangaPageOffsetOverride] = useState<
    boolean | null
  >(null);
  const [prefsLoadedFor, setPrefsLoadedFor] = useState<string | null>(null);
  const [incognito, setIncognito] = useState(false);
  const [debugShowPageNumbers, setDebugShowPageNumbers] = useState(false);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [activeChapter, setActiveChapter] = useState(chapter);
  const [barsVisible, setBarsVisible] = useState(true);
  const [modeHintVisible, setModeHintVisible] = useState(false);
  const barsIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endPlacedRef = useRef<number | null>(null);

  const EMPTY_READER_PAGES: ReaderPage[] = [];

  const prefsKey = `${sourceId}:${manga.key}`;
  const prefsReady = prefsLoadedFor === prefsKey;

  const clearBarsIdleTimer = useCallback(() => {
    if (!barsIdleTimerRef.current) return;
    clearTimeout(barsIdleTimerRef.current);
    barsIdleTimerRef.current = null;
  }, []);

  const hideBars = useCallback(() => {
    clearBarsIdleTimer();
    setBarsVisible(false);
  }, [clearBarsIdleTimer]);

  const hideBarsOnSwipe = Boolean(settings?.hideBarsOnSwipe);
  const handleSwipeInteraction = useCallback(() => {
    if (hideBarsOnSwipe) hideBars();
  }, [hideBarsOnSwipe, hideBars]);

  useEffect(() => clearBarsIdleTimer, [clearBarsIdleTimer]);

  const [chapterSheetOpen, setChapterSheetOpen] = useState(false);
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false);
  const [builtPages, setBuiltPages] = useState<{
    key: string;
    pages: ReaderPage[];
  }>({
    key: "",
    pages: EMPTY_READER_PAGES,
  });
  const readerPages =
    builtPages.key === chapter.key ? builtPages.pages : EMPTY_READER_PAGES;
  const [lockedAutoMode, setLockedAutoMode] =
    useState<ResolvedReadingMode | null>(null);
  const [rememberedAutoMode, setRememberedAutoMode] = useState<
    ResolvedReadingMode | null | undefined
  >(undefined);
  const autoLockedRef = useRef(false);
  const [chaptersToMark, setChaptersToMark] = useState<Chapter[]>([chapter]);
  const [dictionaryEntry, setDictionaryEntry] =
    useState<DictionaryEntry | null>(null);
  const [dictionaryLoading, setDictionaryLoading] = useState(false);
  const [dictionaryVisible, setDictionaryVisible] = useState(false);
  const goToPageRef = useRef<PageSetter>(() => {});
  const restorePageRef = useRef(initialPage);
  const currentPageRef = useRef(currentPage);
  const activeChapterRef = useRef(activeChapter);
  const pageCountRef = useRef(0);
  const deleteAfterReadingRef = useRef(false);
  const persistProgressRef = useRef<
    (
      targetChapter: Chapter,
      pageIndex: number,
      pageCount: number,
      notify?: boolean,
    ) => Promise<void>
  >(async () => {});
  currentPageRef.current = currentPage;
  activeChapterRef.current = activeChapter;

  useEffect(() => {
    const placed = endPlacedRef.current;
    if (placed == null || readerPages.length === 0) return;
    const last = readerPages.length - 1;
    if (last === placed) return;
    if (currentPageRef.current !== placed) {
      endPlacedRef.current = null;
      return;
    }
    endPlacedRef.current = last;
    setCurrentPage(last);
    goToPageRef.current(last, false);
  }, [readerPages]);

  useEffect(() => {
    setActiveChapter(chapter);
    setCurrentPage(initialPage);
    restorePageRef.current = initialPage;
    endPlacedRef.current = startAtEnd ? initialPage : null;
    const timer = setTimeout(() => {
      restorePageRef.current = 0;
    }, 500);
    return () => clearTimeout(timer);
  }, [chapter.key, initialPage, startAtEnd]);

  const pageOffsetEnabled =
    mangaPageOffsetOverride ?? settings?.pagedPageOffset ?? false;

  const loadAppSettings = useCallback(async () => {
    const value = await getAppSettings();
    setSettings((previous) => keepIfEqual(previous, value.reader));
    setDictionarySettings((previous) =>
      keepIfEqual(previous, value.dictionary),
    );
    setIncognito(value.incognitoMode);
    setDebugShowPageNumbers(value.debug.showReaderPageNumbers);
    configureReaderDebug({
      showImageSize: value.debug.showReaderImageSize,
      maxHeightRatio: value.debug.readerMaxHeightRatio,
    });
    deleteAfterReadingRef.current = value.downloads.deleteAfterReading;
  }, []);

  useEffect(() => {
    void loadAppSettings();
    return subscribeAppSettings(() => {
      void loadAppSettings();
    });
  }, [loadAppSettings]);

  useEffect(() => {
    let cancelled = false;
    setRememberedAutoMode(undefined);
    void Promise.all([
      getMangaReadingMode(sourceId, manga.key).catch(() => null),
      getMangaPageOffset(sourceId, manga.key).catch(() => null),
      getMangaAutoResolvedMode(sourceId, manga.key).catch(() => null),
    ]).then(([modeOverride, pageOffset, autoMode]) => {
      if (cancelled) return;
      setMangaModeOverride(modeOverride);
      setMangaPageOffsetOverride(pageOffset);
      setRememberedAutoMode(autoMode);
      setPrefsLoadedFor(prefsKey);
    });
    return () => {
      cancelled = true;
    };
  }, [manga.key, sourceId, prefsKey]);

  useEffect(() => {
    setChaptersToMark([chapter]);
  }, [chapter.key]);

  const orientation = settings?.orientation;

  useEffect(() => {
    if (!orientation) return;

    async function applyOrientation() {
      try {
        switch (orientation) {
          case "portrait":
            await ScreenOrientation.lockAsync(
              ScreenOrientation.OrientationLock.PORTRAIT_UP,
            );
            break;
          case "landscape":
            await ScreenOrientation.lockAsync(
              ScreenOrientation.OrientationLock.LANDSCAPE,
            );
            break;
          case "device":
          default:
            await ScreenOrientation.unlockAsync();
            break;
        }
      } catch {}
    }

    void applyOrientation();
    return () => {
      void ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, [orientation]);

  const statusBarHidden =
    Boolean(settings?.hideStatusBarWithMenu) && !barsVisible;

  useEffect(() => {
    onStatusBarHiddenChange?.(statusBarHidden);
  }, [onStatusBarHiddenChange, statusBarHidden]);

  useEffect(() => {
    if (Platform.OS === "ios") {
      applyStatusBarHidden(navigation, statusBarHidden);
      return;
    }
    StatusBar.setHidden(statusBarHidden, "fade");
    navigation.setOptions({ navigationBarHidden: statusBarHidden });
  }, [navigation, statusBarHidden]);

  useEffect(() => {
    return () => {
      if (Platform.OS === "ios") {
        applyStatusBarHidden(navigation, false);
        return;
      }
      StatusBar.setHidden(false, "fade");
      navigation.setOptions({ navigationBarHidden: false });
    };
  }, [navigation]);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    setBuiltPages({
      key: chapter.key,
      pages: buildReaderPages(pages, settings, chapter.key),
    });
    void materializeReaderPages(
      pages,
      settings,
      chapter.key,
      coverHeaders,
    ).then((built) => {
      if (!cancelled) setBuiltPages({ key: chapter.key, pages: built });
    });
    return () => {
      cancelled = true;
    };
  }, [chapter.key, coverHeaders, pages, settings]);

  const fromManga = useMemo(() => inferReadingModeFromManga(manga), [manga]);
  const wantsAuto = settings
    ? shouldInferModeFromImages(settings, mangaModeOverride)
    : false;

  useEffect(() => {
    autoLockedRef.current = false;
    setLockedAutoMode(null);
  }, [manga.key, mangaModeOverride, settings?.readingMode, wantsAuto]);

  useEffect(() => {
    if (!settings || !wantsAuto) return;
    if (autoLockedRef.current) return;
    if (rememberedAutoMode === undefined) return;

    const commit = (mode: ResolvedReadingMode, persist: boolean) => {
      if (autoLockedRef.current) return;
      autoLockedRef.current = true;
      setLockedAutoMode(mode);
      if (persist) void setMangaAutoResolvedMode(sourceId, manga.key, mode);
    };

    const rememberedStrip =
      rememberedAutoMode === "continuous" || rememberedAutoMode === "webtoon";
    if (rememberedStrip) {
      commit(rememberedAutoMode, false);
      return;
    }

    if (fromManga === "continuous") {
      commit("continuous", true);
      return;
    }

    const probePages = pagesForAutoModeProbe(pages);
    const knownSizes = probePages
      .map((page) =>
        page.width && page.height && page.width > 0 && page.height > 0
          ? { width: page.width, height: page.height }
          : null,
      )
      .filter(
        (item): item is { width: number; height: number } => item != null,
      );
    const fromKnown =
      knownSizes.length > 0 ? inferReadingModeFromImageSizes(knownSizes) : null;
    if (fromKnown?.confident && fromKnown.mode === "continuous") {
      commit("continuous", true);
      return;
    }

    const samples = probePages
      .map((page) => ({
        url: page.url,
        headers: { ...coverHeaders, ...page.headers },
      }))
      .filter(
        (item): item is { url: string; headers: Record<string, string> } =>
          Boolean(item.url),
      );
    if (pages.length === 0) return;
    if (samples.length === 0) {
      commit(
        pickAutoReadingMode(fromManga, fromKnown),
        Boolean(fromKnown?.confident || fromManga === "webtoon"),
      );
      return;
    }

    let cancelled = false;
    const collected = [...knownSizes];

    const consider = (sizes: Array<{ width: number; height: number }>) => {
      if (cancelled || autoLockedRef.current) return;
      const inferred = inferReadingModeFromImageSizes(sizes);
      if (inferred.mode === "continuous" && inferred.confident)
        commit("continuous", true);
    };

    void (async () => {
      await Promise.all(
        samples.map(async (item) => {
          const size = await probeReaderImageDimensions(item.url, item.headers);
          if (cancelled || !size) return;
          collected.push(size);
          consider(collected);
        }),
      );
      if (cancelled || autoLockedRef.current) return;
      const inferred = inferReadingModeFromImageSizes(collected);
      if (inferred.confident) {
        commit(pickAutoReadingMode(fromManga, inferred), true);
        return;
      }
      if (rememberedAutoMode) {
        commit(rememberedAutoMode, false);
        return;
      }
      commit(pickAutoReadingMode(fromManga, inferred), false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    coverHeaders,
    fromManga,
    manga.key,
    pages,
    rememberedAutoMode,
    settings,
    sourceId,
    wantsAuto,
  ]);

  const resolvedBase = useMemo(
    () =>
      settings ? resolveReadingMode(settings, mangaModeOverride, manga) : "rtl",
    [settings, mangaModeOverride, manga],
  );
  const autoPending = Boolean(
    wantsAuto && (lockedAutoMode == null || rememberedAutoMode === undefined),
  );
  const mode = wantsAuto
    ? (lockedAutoMode ?? fromManga ?? "rtl")
    : resolvedBase;
  const stripEnabled = isStripMode(mode);

  useEffect(() => {
    if (!showModeHint || !settings || !prefsReady || autoPending) return;
    setModeHintVisible(true);
    const timer = setTimeout(() => setModeHintVisible(false), MODE_HINT_MS);
    return () => clearTimeout(timer);
  }, [autoPending, mode, prefsReady, settings, showModeHint]);

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: stripEnabled,
      fullScreenGestureEnabled: stripEnabled,
      gestureDirection: "horizontal",
    });
  }, [navigation, stripEnabled]);

  const { segments, loadAdjacent } = useReaderChapterWindow({
    enabled: stripEnabled && prefsReady,
    routeChapter: chapter,
    activeChapterKey: activeChapter.key,
    chapters,
    initialPages: readerPages,
    settings,
    skipDuplicates: settings?.skipDuplicateChapters ?? true,
    loadChapterPages,
    requestHeaders: coverHeaders,
  });

  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  const activePages = useMemo(
    () =>
      segments.find((segment) => segment.chapter.key === activeChapter.key)
        ?.pages ?? readerPages,
    [activeChapter.key, readerPages, segments],
  );
  pageCountRef.current = activePages.length;
  const isText = useMemo(() => isTextChapter(pages), [pages]);
  const backgroundColor = useMemo(
    () =>
      settings
        ? readerBackgroundColor(settings.backgroundColor, colorScheme)
        : "#000000",
    [colorScheme, settings],
  );
  const foregroundColor = useMemo(
    () => readerForegroundColor(backgroundColor),
    [backgroundColor],
  );

  const markChaptersInQueue = useCallback(
    async (chaptersList: Chapter[]) => {
      const seen = new Set<string>();
      for (const item of chaptersList) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        await markChapterRead(sourceId, manga.key, item.key, {
          mangaTitle: manga.title,
          chapterTitle: formatChapterLabel(item),
          cover: manga.cover,
          notify: false,
        });
      }
    },
    [manga.cover, manga.key, manga.title, sourceId],
  );

  const persistProgress = useCallback(
    async (
      targetChapter: Chapter,
      pageIndex: number,
      pageCount: number,
      notify = true,
    ) => {
      const historyMeta = {
        mangaTitle: manga.title,
        chapterTitle: formatChapterLabel(targetChapter),
        cover: manga.cover,
        notify,
      };
      const isLastPage = pageCount > 0 && pageIndex >= pageCount - 1;
      const existing = await getChapterProgress(
        sourceId,
        manga.key,
        targetChapter.key,
      );
      const alreadyRead = existing?.page === -1;
      if (alreadyRead) return;
      if (isLastPage) {
        if (settings?.markDuplicateChapters) {
          await markChaptersInQueue(
            chaptersToMark.some((item) => item.key === targetChapter.key)
              ? chaptersToMark
              : [targetChapter, ...chaptersToMark],
          );
        } else {
          await markChapterRead(
            sourceId,
            manga.key,
            targetChapter.key,
            historyMeta,
          );
        }
        const nextChapter = findAdjacentChapter(
          chapters,
          targetChapter.key,
          "next",
          settings?.skipDuplicateChapters ?? true,
        );
        if (nextChapter) {
          const nextProgress = await getChapterProgress(
            sourceId,
            manga.key,
            nextChapter.key,
          );
          if (nextProgress?.page !== -1) {
            await recordChapterProgress(
              sourceId,
              manga.key,
              nextChapter.key,
              nextProgress && nextProgress.page >= 0 ? nextProgress.page : 0,
              {
                mangaTitle: manga.title,
                chapterTitle: formatChapterLabel(nextChapter),
                cover: manga.cover,
                notify,
              },
            );
          }
        }
        if (deleteAfterReadingRef.current) {
          await removeChapterDownload(sourceId, manga.key, targetChapter.key);
        }
        return;
      }
      await recordChapterProgress(
        sourceId,
        manga.key,
        targetChapter.key,
        pageIndex,
        historyMeta,
      );
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
  const pendingPersistRef = useRef<{
    chapter: Chapter;
    page: number;
    count: number;
  } | null>(null);

  const schedulePersist = useCallback(
    (targetChapter: Chapter, pageIndex: number, pageCount: number) => {
      pendingPersistRef.current = {
        chapter: targetChapter,
        page: pageIndex,
        count: pageCount,
      };
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        const pending = pendingPersistRef.current;
        pendingPersistRef.current = null;
        if (!pending) return;
        void persistProgressRef.current(
          pending.chapter,
          pending.page,
          pending.count,
          false,
        );
      }, 900);
    },
    [],
  );

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

  useEffect(() => {
    return () => {
      clearDecodedImageCache();
    };
  }, []);

  const handleLocationChange = useCallback(
    (nextChapter: Chapter, pageIndex: number, pageCount: number) => {
      const restoringTo = restorePageRef.current;
      if (
        nextChapter.key === chapter.key &&
        restoringTo > 0 &&
        pageIndex === 0 &&
        pageIndex !== restoringTo
      ) {
        return;
      }
      if (
        nextChapter.key === chapter.key &&
        restoringTo > 0 &&
        pageIndex === restoringTo
      ) {
        restorePageRef.current = 0;
      }

      const previous = activeChapterRef.current;
      if (previous.key !== nextChapter.key) {
        const movingForward =
          findAdjacentChapter(chapters, previous.key, "next", true)?.key ===
          nextChapter.key;
        if (movingForward) {
          const previousCount =
            segmentsRef.current.find(
              (segment) => segment.chapter.key === previous.key,
            )?.pages.length ?? 0;
          if (previousCount > 0) {
            if (persistTimerRef.current) {
              clearTimeout(persistTimerRef.current);
              persistTimerRef.current = null;
            }
            pendingPersistRef.current = null;
            void persistProgress(
              previous,
              previousCount - 1,
              previousCount,
              false,
            );
          }
        }
        setActiveChapter(nextChapter);
      }

      setCurrentPage(pageIndex);
      schedulePersist(nextChapter, pageIndex, pageCount);
    },
    [chapter.key, chapters, persistProgress, schedulePersist],
  );

  const handlePageChange = useCallback(
    (index: number) => {
      handleLocationChange(
        activeChapterRef.current,
        index,
        pageCountRef.current,
      );
    },
    [handleLocationChange],
  );

  const setPageRef = useCallback((fn: PageSetter) => {
    goToPageRef.current = fn;
  }, []);

  const navigateChapter = useCallback(
    (nextChapter: Chapter, extraToMark: Chapter[] = [], openAtEnd = false) => {
      if (settings?.markDuplicateChapters && extraToMark.length > 0) {
        void markChaptersInQueue(extraToMark);
      }
      router.replace({
        pathname: "/reader",
        params: {
          sourceId,
          mangaKey: encodeURIComponent(manga.key),
          chapterKey: encodeURIComponent(nextChapter.key),
          chapterTitle: formatChapterLabel(nextChapter),
          mangaTitle: manga.title,
          ...(manga.cover ? { cover: manga.cover } : {}),
          switched: "1",
          ...(openAtEnd ? { page: "last" } : {}),
        },
      });
    },
    [
      markChaptersInQueue,
      manga.cover,
      manga.key,
      manga.title,
      router,
      settings?.markDuplicateChapters,
      sourceId,
    ],
  );

  const goNextChapter = useCallback(() => {
    if (stripEnabled) {
      void loadAdjacent("next");
      return;
    }
    const result = findAdjacentChapterWithSkipped(
      chapters,
      activeChapterRef.current.key,
      "next",
      settings?.skipDuplicateChapters ?? true,
    );
    if (!result.chapter) return;
    const toMark = settings?.markDuplicateChapters
      ? result.skippedDuplicates
      : [];
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
      void loadAdjacent("previous");
      return;
    }
    const result = findAdjacentChapterWithSkipped(
      chapters,
      activeChapterRef.current.key,
      "previous",
      settings?.skipDuplicateChapters ?? true,
    );
    if (!result.chapter) return;
    const toMark = settings?.markDuplicateChapters
      ? result.skippedDuplicates
      : [];
    setChaptersToMark([result.chapter, ...toMark]);
    navigateChapter(result.chapter, toMark, true);
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

  const dictionaryEnabled = dictionarySettings?.enable;

  const lookupDictionary = useCallback(
    async (
      pageUrl: string,
      x: number,
      y: number,
      layout: { width: number; height: number },
    ) => {
      if (!dictionaryEnabled || !pageUrl) return;
      setDictionaryVisible(true);
      setDictionaryLoading(true);
      setDictionaryEntry(null);
      try {
        const lines = await extractTextFromImage(pageUrl);
        const word = pickWordNearTap(
          lines.join(" "),
          x,
          y,
          layout.width,
          layout.height,
        );
        if (!word) {
          setDictionaryEntry(null);
          return;
        }
        const entry = await lookupWord(word);
        setDictionaryEntry(entry);
      } catch {
        setDictionaryEntry(null);
      } finally {
        setDictionaryLoading(false);
      }
    },
    [dictionaryEnabled],
  );

  const closeChapterSheet = useCallback(() => setChapterSheetOpen(false), []);
  const closeReaderSettings = useCallback(
    () => setReaderSettingsOpen(false),
    [],
  );
  const closeDictionary = useCallback(() => setDictionaryVisible(false), []);

  const handleMangaReadingModeChange = useCallback<ModeChangeHandler>(
    (nextMode) => {
      setMangaModeOverride(nextMode === "default" ? null : nextMode);
      if (nextMode !== "default" && nextMode !== "auto") {
        setRememberedAutoMode(nextMode);
      }
    },
    [],
  );

  const activeChapterUrl = activeChapter.url;
  const activeChapterKey = activeChapter.key;
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void getBookmarkedChapterKeys(sourceId, manga.key).then((keys) => {
        if (!cancelled) setBookmarked(keys.has(activeChapterKey));
      });
    };
    load();
    const unsubscribe = subscribeMangaData(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sourceId, manga.key, activeChapterKey]);

  const toggleBookmark = useCallback(() => {
    setBookmarked((value) => !value);
    void toggleChapterBookmark(sourceId, manga.key, activeChapterKey).then(
      setBookmarked,
    );
  }, [sourceId, manga.key, activeChapterKey]);

  const shareManga = useCallback(() => {
    const url = mangaPageUrl ?? activeChapterUrl;
    if (!url) return;
    void Share.share(
      Platform.OS === "ios" ? { url, message: manga.title } : { message: url },
    );
  }, [mangaPageUrl, activeChapterUrl, manga.title]);

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
        if (router.canGoBack()) router.back();
        else router.replace("/");
      },
      openChapterUrl: () => {
        const url = mangaPageUrl ?? activeChapterUrl;
        if (url) void WebBrowser.openBrowserAsync(url);
      },
      toggleBookmark,
      shareManga,
      openSettings: () => router.navigate("/settings/reader"),
      openReaderSettings: () => setReaderSettingsOpen(true),
      selectChapter: (nextChapter) => navigateChapter(nextChapter),
      lookupDictionary,
      loadAdjacentChapter: (direction) => {
        void loadAdjacent(direction);
      },
    }),
    [
      activeChapterUrl,
      mangaPageUrl,
      toggleBookmark,
      shareManga,
      goNext,
      goNextChapter,
      goPrevious,
      loadAdjacent,
      lookupDictionary,
      navigateChapter,
      router,
    ],
  );

  const totalPages = activePages.length;
  const liveChapterLabel = formatChapterLabel(activeChapter);
  const liveMangaTitle = manga.title;

  useEffect(() => {
    if (totalPages <= 0) return;
    syncReadingLiveActivity({
      mangaTitle: liveMangaTitle,
      chapterLabel: liveChapterLabel,
      page: Math.min(currentPage + 1, totalPages),
      total: totalPages,
    });
  }, [currentPage, totalPages, liveChapterLabel, liveMangaTitle]);

  useEffect(() => () => syncReadingLiveActivity(null), []);

  const chrome: ReaderChromeState = useMemo(
    () => ({
      barsVisible,
      currentPage,
      totalPages,
      pagesRemaining: Math.max(0, totalPages - currentPage - 1),
      chapterTitle:
        chapterTitleForDisplay(activeChapter) ||
        formatChapterLabel(activeChapter),
      mangaTitle: manga.title,
      incognito,
    }),
    [
      activeChapter,
      barsVisible,
      currentPage,
      incognito,
      manga.title,
      totalPages,
    ],
  );

  const providerValue = useMemo<ReaderValue | null>(() => {
    if (!settings || !dictionarySettings) return null;
    return {
      sourceId,
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
      chapterUrl: activeChapterUrl,
      mangaPageUrl,
      bookmarked,
      stripSegments: segments,
      debugShowPageNumbers,
    };
  }, [
    actions,
    activeChapter,
    activeChapterUrl,
    mangaPageUrl,
    bookmarked,
    activePages,
    backgroundColor,
    chapters,
    chrome,
    coverHeaders,
    debugShowPageNumbers,
    dictionarySettings,
    foregroundColor,
    isText,
    manga,
    mode,
    segments,
    settings,
  ]);

  if (
    !settings ||
    !dictionarySettings ||
    !providerValue ||
    !prefsReady ||
    autoPending ||
    (!isText && pages.length > 0 && readerPages.length === 0)
  ) {
    return (
      <View style={[styles.root, styles.loading]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <ReaderProvider value={providerValue}>
      <View style={[styles.root, { backgroundColor }]}>
        {Platform.OS === "android" ? (
          <StatusBar
            hidden={statusBarHidden}
            animated
            barStyle="light-content"
            backgroundColor={backgroundColor}
          />
        ) : null}
        {isText ? (
          <ReaderTextView
            currentPage={currentPage}
            onPageChange={handlePageChange}
            setPageRef={setPageRef}
          />
        ) : stripEnabled ? (
          <ReaderWebtoonView
            key={chapter.key}
            currentPage={currentPage}
            onLocationChange={handleLocationChange}
            onInteraction={handleSwipeInteraction}
            setPageRef={setPageRef}
          />
        ) : (
          <ReaderPagedView
            key={chapter.key}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            onInteraction={handleSwipeInteraction}
            setPageRef={setPageRef}
            pageOffsetEnabled={pageOffsetEnabled}
            onTogglePageOffset={togglePageOffset}
          />
        )}

        <ReaderNavBar visible={barsVisible} />
        <ReaderToolbar visible={barsVisible} />
        {modeHintVisible ? <ReaderModeHint mode={mode} /> : null}
        <ReaderChapterSheet
          visible={chapterSheetOpen}
          onClose={closeChapterSheet}
        />
        <ReaderSettingsSheet
          visible={readerSettingsOpen}
          sourceId={sourceId}
          mangaReadingMode={mangaModeOverride}
          onClose={closeReaderSettings}
          onMangaReadingModeChange={handleMangaReadingModeChange}
        />
        <ReaderDictionaryPopup
          visible={dictionaryVisible}
          entry={dictionaryEntry}
          loading={dictionaryLoading}
          displayMode={dictionarySettings.displayMode}
          popupWidth={dictionarySettings.popupWidth}
          popupHeight={dictionarySettings.popupHeight}
          onClose={closeDictionary}
        />
      </View>
    </ReaderProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
});
