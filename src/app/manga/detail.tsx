import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  View,
} from "react-native";

import {
  MangaDetailHeaderLeft,
  MangaDetailHeaderRight,
} from "@/components/manga/manga-detail-header";
import { MangaDetailView } from "@/components/manga/manga-detail-view";
import { EmptyState } from "@/components/ui/empty-state";
import { ScreenContent } from "@/components/ui/screen-content";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import { useSources } from "@/context/sources-context";
import { SourceCoverHeadersProvider } from "@/context/source-cover-context";
import { useMangaDataRefresh } from "@/hooks/use-manga-data";
import { useMangaDetail } from "@/hooks/use-manga-detail";
import { useSourceRunner } from "@/hooks/use-source-runner";
import type { Chapter } from "@/parsers/shared/types";
import {
  getMangaDownloads,
  queueChapterDownloads,
  removeMangaDownloads,
  type DownloadEntry,
} from "@/services/downloads";
import { processQueuedDownloads } from "@/services/download-processor";
import {
  ALL_CATEGORY_ID,
  getLibraryCategories,
  getLibraryEntry,
  isInLibrary,
  toggleMangaLibraryCategory,
  type LibraryCategory,
} from "@/services/library";
import {
  getMangaChapterProgress,
  markAllChaptersRead,
  markAllChaptersUnread,
  markChapterRead,
  markChapterUnread,
  type ChapterProgress,
} from "@/services/manga-tracking";
import {
  findInstalledSource,
  parseSourceRouteId,
  sourceRouteId,
} from "@/services/sources";
import { chaptersOldestFirst, formatChapterLabel } from "@/utils/chapter-label";
import { subscribeMangaData } from "@/utils/manga-events";
import {
  mangaFromParams,
  mangaTransferHref,
  readerHref,
} from "@/utils/manga-route";
import { resolveMangaPageUrl } from "@/utils/manga-url";
import { getAppSettings } from "@/services/app-settings";
import { subscribeAppSettings } from "@/utils/app-settings-events";

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  refreshIndicator: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});

function decodeParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function shallowEqual(a: object, b: object): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (
      (a as Record<string, unknown>)[key] !==
      (b as Record<string, unknown>)[key]
    ) {
      return false;
    }
  }
  return true;
}

function reuseRecord<T extends object>(
  prev: Record<string, T>,
  next: Record<string, T>,
): Record<string, T> {
  const nextKeys = Object.keys(next);
  let changed = nextKeys.length !== Object.keys(prev).length;
  const result: Record<string, T> = {};
  for (const key of nextKeys) {
    const old = prev[key];
    const cur = next[key]!;
    if (old && shallowEqual(old, cur)) {
      result[key] = old;
    } else {
      result[key] = cur;
      changed = true;
    }
  }
  return changed ? result : prev;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function readKeysFrom(progress: Record<string, ChapterProgress>): Set<string> {
  const keys = new Set<string>();
  for (const entry of Object.values(progress)) {
    if (entry.page === -1) keys.add(entry.chapterKey);
  }
  return keys;
}

function resolveReadingTarget(
  chapters: Chapter[],
  progressMap: Record<string, ChapterProgress>,
): { chapter: Chapter; page: number; hasHistory: boolean } | null {
  if (chapters.length === 0) return null;

  const first = chapters[chapters.length - 1]!;

  let resume: ChapterProgress | undefined;
  for (const entry of Object.values(progressMap)) {
    if (!resume || entry.dateRead > resume.dateRead) resume = entry;
  }

  if (!resume) {
    return { chapter: first, page: 0, hasHistory: false };
  }

  const chapter =
    chapters.find((item) => item.key === resume.chapterKey) ?? first;
  const page = resume.page >= 0 ? resume.page : 0;
  return { chapter, page, hasHistory: true };
}

export default function MangaDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sourceId: string;
    mangaKey: string;
    title?: string;
    cover?: string;
    url?: string;
  }>();
  const sourceRoute = decodeParam(params.sourceId);
  const mangaKey = decodeParam(params.mangaKey);
  const { colors } = useTheme();
  const { installed, isLoading: sourcesLoading } = useSources();
  const installedReady = !sourcesLoading;
  const source = findInstalledSource(installed, sourceRoute);
  const manifestSourceId = source?.id ?? sourceRoute;
  const cacheSourceId = source?.id ?? parseSourceRouteId(sourceRoute).id;
  const sourceKey = source ? sourceRouteId(source) : null;
  const { runner, error } = useSourceRunner(source);
  const refreshTick = useMangaDataRefresh();
  const initialManga = useMemo(
    () =>
      mangaFromParams(
        manifestSourceId,
        mangaKey,
        decodeParam(params.title),
        decodeParam(params.cover),
        decodeParam(params.url),
      ),
    [manifestSourceId, mangaKey, params.title, params.cover, params.url],
  );
  const {
    manga,
    isLoading,
    isRefreshing,
    loadError,
    hasCachedContent,
    refresh,
    dismissError,
  } = useMangaDetail({ source, runner, initialManga, cacheSourceId });

  const [inLibrary, setInLibraryState] = useState(false);
  const [chapterProgressMap, setChapterProgressMap] = useState<
    Record<string, ChapterProgress>
  >({});
  const [readChapterKeys, setReadChapterKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [chapterDownloads, setChapterDownloads] = useState<
    Record<string, DownloadEntry>
  >({});
  const [downloadedChapterKeys, setDownloadedChapterKeys] = useState<
    Set<string>
  >(() => new Set());
  const [libraryCategories, setLibraryCategories] = useState<LibraryCategory[]>(
    [],
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [chapterSelectMode, setChapterSelectMode] = useState(false);
  const [selectedChapterKeys, setSelectedChapterKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [showBigMangaCover, setShowBigMangaCover] = useState(false);
  const [showChapterNumber, setShowChapterNumber] = useState(true);

  const bulkBusyRef = useRef(false);

  const handlersRef = useRef({
    onCancelSelect: () => {},
    onApplySelect: () => {},
    onShare: () => {},
    onSelectChapters: () => {},
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

  const mangaPageUrl = useMemo(
    () =>
      source ? resolveMangaPageUrl(manga, source.manifest.info.url) : undefined,
    [manga, source],
  );

  const chapters = useMemo(
    () =>
      [...(manga.chapters ?? [])].sort(
        (a, b) => (b.chapterNumber ?? 0) - (a.chapterNumber ?? 0),
      ),
    [manga.chapters],
  );

  const chapterKeys = useMemo(
    () => chapters.map((chapter) => chapter.key),
    [chapters],
  );

  const liveState = {
    chapters,
    chapterKeys,
    readChapterKeys,
    downloadedChapterKeys,
    libraryCategories,
    chapterProgressMap,
    selectedChapterKeys,
    installed,
    inLibrary,
    mangaTitle: manga.title,
    mangaCover: manga.cover,
    mangaStatus: manga.status,
  };
  const live = useRef(liveState);
  live.current = liveState;

  const loadSettings = useCallback(async () => {
    const settings = await getAppSettings();
    setShowBigMangaCover(settings.mangaScreen.showBigMangaCover);
    setShowChapterNumber(settings.mangaScreen.showChapterNumber);
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings, refreshTick]);

  useEffect(
    () => subscribeAppSettings(() => void loadSettings()),
    [loadSettings],
  );

  const refreshDownloads = useCallback(async () => {
    const downloads = await getMangaDownloads(manifestSourceId, mangaKey);
    const nextMap: Record<string, DownloadEntry> = {};
    const completed = new Set<string>();
    for (const entry of downloads) {
      nextMap[entry.chapterKey] = entry;
      if (entry.status === "completed") completed.add(entry.chapterKey);
    }
    setChapterDownloads((prev) => reuseRecord(prev, nextMap));
    setDownloadedChapterKeys((prev) =>
      setsEqual(prev, completed) ? prev : completed,
    );
  }, [manifestSourceId, mangaKey]);

  useEffect(() => {
    void refreshDownloads();
  }, [refreshDownloads, refreshTick]);

  const applyProgress = useCallback(
    (progress: Record<string, ChapterProgress>) => {
      setChapterProgressMap((prev) => reuseRecord(prev, progress));
      setReadChapterKeys((prev) => {
        const next = readKeysFrom(progress);
        return setsEqual(prev, next) ? prev : next;
      });
    },
    [],
  );

  const refreshProgress = useCallback(async () => {
    applyProgress(await getMangaChapterProgress(manifestSourceId, mangaKey));
  }, [manifestSourceId, mangaKey, applyProgress]);

  useFocusEffect(
    useCallback(() => {
      void refreshProgress();
      return subscribeMangaData(() => {
        if (bulkBusyRef.current) return;
        void refreshProgress();
      });
    }, [refreshProgress]),
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [library, entry] = await Promise.all([
        isInLibrary(manifestSourceId, mangaKey),
        getLibraryEntry(manifestSourceId, mangaKey),
      ]);
      if (cancelled) return;
      setInLibraryState(library);
      setSelectedCategoryIds(entry?.categoryIds ?? []);
    };

    if (hasCachedContent) {
      const timer = setTimeout(() => void load(), 1);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [manifestSourceId, mangaKey, hasCachedContent]);

  useEffect(() => {
    let cancelled = false;
    void getLibraryCategories().then((categories) => {
      if (cancelled) return;
      setLibraryCategories((prev) =>
        JSON.stringify(prev) === JSON.stringify(categories) ? prev : categories,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const readingTarget = useMemo(
    () => resolveReadingTarget(chapters, chapterProgressMap),
    [chapters, chapterProgressMap],
  );

  const continueLabel = useMemo(() => {
    if (!readingTarget || !readingTarget.hasHistory) {
      return t("manga_start_reading");
    }
    const chapterNumber = readingTarget.chapter.chapterNumber;
    return t("manga_continue_reading", {
      chapter: `${chapterNumber && showChapterNumber ? `#${chapterNumber} - ` : ""}${formatChapterLabel(readingTarget.chapter)}`,
    });
  }, [readingTarget, showChapterNumber]);

  const openChapter = useCallback(
    (chapter: Chapter, initialPage?: number) => {
      if (!sourceKey) return;
      const s = live.current;
      const saved = s.chapterProgressMap[chapter.key];
      const page = initialPage ?? (saved && saved.page >= 0 ? saved.page : 0);
      router.navigate(
        readerHref(
          sourceKey,
          mangaKey,
          chapter.key,
          formatChapterLabel(chapter),
          s.mangaTitle,
          page,
          s.mangaCover,
        ),
      );
    },
    [router, sourceKey, mangaKey],
  );

  const handleMarkChapterRead = useCallback(
    (chapter: Chapter) => {
      setReadChapterKeys((previous) => {
        if (previous.has(chapter.key)) return previous;
        const next = new Set(previous);
        next.add(chapter.key);
        return next;
      });
      void markChapterRead(manifestSourceId, mangaKey, chapter.key, {
        mangaTitle: live.current.mangaTitle,
        chapterTitle: formatChapterLabel(chapter),
        cover: live.current.mangaCover,
      }).then(() => refreshProgress());
    },
    [manifestSourceId, mangaKey, refreshProgress],
  );

  const handleMarkChapterUnread = useCallback(
    (chapter: Chapter) => {
      setReadChapterKeys((previous) => {
        if (!previous.has(chapter.key)) return previous;
        const next = new Set(previous);
        next.delete(chapter.key);
        return next;
      });
      setChapterProgressMap((previous) => {
        if (!(chapter.key in previous)) return previous;
        const next = { ...previous };
        delete next[chapter.key];
        return next;
      });
      void markChapterUnread(manifestSourceId, mangaKey, chapter.key).then(() =>
        refreshProgress(),
      );
    },
    [manifestSourceId, mangaKey, refreshProgress],
  );

  const handleToggleLibraryPicker = useCallback(() => {
    setLibraryPickerOpen((value) => !value);
  }, []);

  const handleToggleCategory = useCallback(
    (categoryId: string) => {
      const s = live.current;
      setSelectedCategoryIds((previous) =>
        previous.includes(categoryId)
          ? previous.filter((id) => id !== categoryId)
          : [...previous, categoryId],
      );
      setInLibraryState(true);
      if (s.libraryCategories.some((c) => c.id !== ALL_CATEGORY_ID)) {
        setLibraryPickerOpen(true);
      }

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let unreadCount = 0;
      for (const chapter of s.chapters) {
        if (!s.readChapterKeys.has(chapter.key)) unreadCount++;
      }

      void toggleMangaLibraryCategory(manifestSourceId, mangaKey, categoryId, {
        title: s.mangaTitle,
        cover: s.mangaCover,
        unreadCount,
        downloadedCount: s.downloadedChapterKeys.size,
        knownChapterKeys: s.chapterKeys,
        status: s.mangaStatus,
      }).then((result) => {
        setInLibraryState(result.inLibrary);
        setSelectedCategoryIds(result.categoryIds);
        if (!result.inLibrary) setLibraryPickerOpen(false);
      });
    },
    [manifestSourceId, mangaKey],
  );

  const handleOpenInBrowser = useCallback(() => {
    if (!mangaPageUrl) return;
    void WebBrowser.openBrowserAsync(mangaPageUrl);
  }, [mangaPageUrl]);

  const handleShare = useCallback(() => {
    if (!mangaPageUrl) return;
    void Share.share({
      message: mangaPageUrl,
      url: mangaPageUrl,
      title: live.current.mangaTitle,
    });
  }, [mangaPageUrl]);

  const handleContinueReading = useCallback(() => {
    if (!readingTarget) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openChapter(readingTarget.chapter, readingTarget.page);
  }, [openChapter, readingTarget]);

  const applyReadOptimistic = useCallback((keys: string[], read: boolean) => {
    setReadChapterKeys((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (read) next.add(key);
        else next.delete(key);
      }
      return setsEqual(prev, next) ? prev : next;
    });
    if (!read) {
      setChapterProgressMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const key of keys) {
          if (key in next) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, []);

  const runBulkMark = useCallback(
    (keys: string[], read: boolean) => {
      if (keys.length === 0) return;
      applyReadOptimistic(keys, read);
      const { mangaTitle, mangaCover } = live.current;
      bulkBusyRef.current = true;

      requestAnimationFrame(() => {
        setTimeout(() => {
          void (async () => {
            try {
              const startedAt = Date.now();
              if (read) {
                await markAllChaptersRead(manifestSourceId, mangaKey, keys, {
                  mangaTitle,
                  cover: mangaCover,
                });
              } else {
                await markAllChaptersUnread(manifestSourceId, mangaKey, keys);
              }
              if (__DEV__) {
                console.log("bulk mark ms:", Date.now() - startedAt);
              }
            } catch (e) {
              console.warn("bulk mark failed", e);
            } finally {
              bulkBusyRef.current = false;
              await refreshProgress();
            }
          })();
        }, 0);
      });
    },
    [manifestSourceId, mangaKey, applyReadOptimistic, refreshProgress],
  );

  const handleMarkAllRead = useCallback(
    () => runBulkMark(live.current.chapterKeys, true),
    [runBulkMark],
  );

  const handleMarkAllUnread = useCallback(
    () => runBulkMark(live.current.chapterKeys, false),
    [runBulkMark],
  );

  const queueDownloads = useCallback(
    async (filter?: Set<string>) => {
      const s = live.current;
      const entries = chaptersOldestFirst(s.chapters)
        .filter((chapter) => !filter || filter.has(chapter.key))
        .map((chapter) => ({
          sourceId: manifestSourceId,
          mangaKey,
          chapterKey: chapter.key,
          mangaTitle: s.mangaTitle,
          chapterTitle: formatChapterLabel(chapter),
        }));
      await queueChapterDownloads(entries);
      void processQueuedDownloads(s.installed);
      await refreshDownloads();
    },
    [manifestSourceId, mangaKey, refreshDownloads],
  );

  const handleDownloadAll = useCallback(async () => {
    if (!live.current.inLibrary) {
      Alert.alert(t("manga_download_requires_library"));
      return;
    }
    await queueDownloads();
    Alert.alert(t("manga_download_all"), t("manga_download_all_queued"));
  }, [queueDownloads]);

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
    const selected = new Set(live.current.selectedChapterKeys);
    exitChapterSelectMode();
    if (selected.size === 0) return;
    if (!live.current.inLibrary) {
      Alert.alert(t("manga_download_requires_library"));
      return;
    }
    await queueDownloads(selected);
    Alert.alert(t("manga_download_selected"), t("manga_download_all_queued"));
  }, [exitChapterSelectMode, queueDownloads]);

  const toggleChapterSelected = useCallback((chapter: Chapter) => {
    setSelectedChapterKeys((previous) => {
      const next = new Set(previous);
      if (next.has(chapter.key)) next.delete(chapter.key);
      else next.add(chapter.key);
      return next;
    });
  }, []);

  const selectAllChapters = useCallback(() => {
    setSelectedChapterKeys(new Set(live.current.chapterKeys));
  }, []);

  const deselectAllChapters = useCallback(() => {
    setSelectedChapterKeys(new Set());
  }, []);

  const handleBulkMarkRead = useCallback(() => {
    const keys = Array.from(live.current.selectedChapterKeys);
    exitChapterSelectMode();
    runBulkMark(keys, true);
  }, [exitChapterSelectMode, runBulkMark]);

  const handleBulkMarkUnread = useCallback(() => {
    const keys = Array.from(live.current.selectedChapterKeys);
    exitChapterSelectMode();
    runBulkMark(keys, false);
  }, [exitChapterSelectMode, runBulkMark]);

  const enterChapterSelectMode = useCallback(
    () => setChapterSelectMode(true),
    [],
  );

  handlersRef.current = {
    onCancelSelect: exitChapterSelectMode,
    onApplySelect: exitChapterSelectMode,
    onShare: handleShare,
    onSelectChapters: enterChapterSelectMode,
    onMarkAllRead: handleMarkAllRead,
    onMarkAllUnread: handleMarkAllUnread,
    onMarkSelectedRead: handleBulkMarkRead,
    onMarkSelectedUnread: handleBulkMarkUnread,
    onSelectAll: selectAllChapters,
    onDeselectAll: deselectAllChapters,
    onRefresh: () => refresh(),
    onDownloadAll: () => void handleDownloadAll(),
    onDownloadSelected: () => void handleDownloadSelected(),
    onRemoveDownloads: () => void handleRemoveDownloads(),
  };

  const hasDownloads = downloadedChapterKeys.size > 0;

  const headerRight = useCallback(
    () => (
      <View style={styles.headerActions}>
        {isRefreshing ? (
          <View style={styles.refreshIndicator}>
            <ActivityIndicator
              size="small"
              color={showBigMangaCover ? colors.tint : undefined}
            />
          </View>
        ) : null}
        <MangaDetailHeaderRight
          chapterSelectMode={chapterSelectMode}
          hasDownloads={hasDownloads}
          canShare={Boolean(mangaPageUrl)}
          canDownload={inLibrary}
          onApplySelect={() => handlersRef.current.onApplySelect()}
          onShare={() => handlersRef.current.onShare()}
          onSelectChapters={() => handlersRef.current.onSelectChapters()}
          onMarkAllRead={() => handlersRef.current.onMarkAllRead()}
          onMarkAllUnread={() => handlersRef.current.onMarkAllUnread()}
          onMarkSelectedRead={() => handlersRef.current.onMarkSelectedRead()}
          onMarkSelectedUnread={() =>
            handlersRef.current.onMarkSelectedUnread()
          }
          onSelectAll={() => handlersRef.current.onSelectAll()}
          onDeselectAll={() => handlersRef.current.onDeselectAll()}
          onRefresh={() => handlersRef.current.onRefresh()}
          onDownloadAll={() => handlersRef.current.onDownloadAll()}
          onDownloadSelected={() => handlersRef.current.onDownloadSelected()}
          onRemoveDownloads={() => handlersRef.current.onRemoveDownloads()}
        />
      </View>
    ),
    [
      chapterSelectMode,
      hasDownloads,
      inLibrary,
      isRefreshing,
      mangaPageUrl,
      showBigMangaCover,
      colors.tint,
    ],
  );

  const headerLeft = useCallback(
    () => (
      <MangaDetailHeaderLeft
        chapterSelectMode={chapterSelectMode}
        onBack={() => router.back()}
        onCancelSelect={() => handlersRef.current.onCancelSelect()}
      />
    ),
    [chapterSelectMode, router],
  );

  const screenOptions = useMemo(
    () => ({
      title: chapterSelectMode ? t("manga_select_chapters") : manga.title,
      headerBackVisible: false as const,
      headerLeft,
      headerRight,
    }),
    [chapterSelectMode, headerLeft, headerRight, manga.title],
  );

  const errorOnlyOptions = useMemo(
    () => ({
      title: manga.title,
      headerBackVisible: false as const,
      headerLeft,
    }),
    [manga.title, headerLeft],
  );

  const combinedError = error ?? loadError;
  const hasDisplayContent =
    hasCachedContent ||
    Boolean(manga.title?.trim()) ||
    Boolean(manga.cover) ||
    Boolean(manga.description?.trim()) ||
    (manga.chapters?.length ?? 0) > 0;
  const showBlockingError =
    Boolean(combinedError) && !hasDisplayContent && !isLoading;
  const showInlineError = Boolean(combinedError) && !showBlockingError;
  const showInitialLoading =
    isLoading && !hasCachedContent && !hasDisplayContent;
  const showChapterLoading = isLoading && chapters.length === 0;

  const missingAlertShown = useRef(false);
  useEffect(() => {
    if (source || missingAlertShown.current || !installedReady) return;
    missingAlertShown.current = true;
    Alert.alert(t("sources_not_found"), t("manga_source_missing_message"), [
      { text: t("ok"), style: "cancel" },
      {
        text: t("manga_transfer"),
        onPress: () =>
          router.replace(
            mangaTransferHref(
              sourceRoute,
              mangaKey,
              initialManga.title,
              initialManga.cover,
            ),
          ),
      },
    ]);
  }, [source, installedReady, router, sourceRoute, mangaKey, initialManga]);

  if (!source) {
    return (
      <>
        <Stack.Screen options={{ title: t("sources_not_found") }} />
        <ScreenContent>
          <EmptyState
            icon="alert-circle-outline"
            title={t("sources_not_found")}
          />
        </ScreenContent>
      </>
    );
  }

  if (showBlockingError) {
    return (
      <SourceCoverHeadersProvider source={source}>
        <Stack.Screen options={errorOnlyOptions} />
        <ScreenContent centerContent>
          <EmptyState
            icon="alert-circle-outline"
            title={t("sources_load_error_title")}
            description={combinedError!}
          />
        </ScreenContent>
      </SourceCoverHeadersProvider>
    );
  }

  if (showInitialLoading) {
    return (
      <SourceCoverHeadersProvider source={source}>
        <Stack.Screen options={errorOnlyOptions} />
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
        showBigMangaCover={showBigMangaCover}
        showChapterNumber={showChapterNumber}
        inlineError={showInlineError ? combinedError : null}
        onDismissInlineError={dismissError}
        isLoading={showChapterLoading}
        isRefreshing={isRefreshing}
        onOpenChapter={openChapter}
        onContinueReading={handleContinueReading}
        onToggleLibraryPicker={handleToggleLibraryPicker}
        onToggleCategory={handleToggleCategory}
        onOpenInBrowser={handleOpenInBrowser}
        onMarkChapterRead={handleMarkChapterRead}
        onMarkChapterUnread={handleMarkChapterUnread}
        onToggleChapterSelected={toggleChapterSelected}
        onSelectAllChapters={selectAllChapters}
        onDeselectAllChapters={deselectAllChapters}
        onRefresh={refresh}
      />
    </SourceCoverHeadersProvider>
  );
}
