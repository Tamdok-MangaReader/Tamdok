import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, Pressable, View, StyleSheet } from "react-native";

import { resolveMangaPageUrl } from "@/utils/manga-url";
import { ReaderView } from "@/components/reader/reader-view";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/ui/empty-state";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import {
  SourceCoverHeadersProvider,
  useSourceCoverHeaders,
  useSourceCoverHeadersReady,
} from "@/context/source-cover-context";
import { useSources } from "@/context/sources-context";
import { useSourceRunner } from "@/hooks/use-source-runner";
import type { Chapter, Manga, Page } from "@/parsers/shared/types";
import { getDownloadedPageUrls, getDownloads } from "@/services/downloads";
import { isOffline } from "@/services/network";
import { cancelAidokuSourceRequests } from "@/parsers/aidoku/wasm-bridge";
import { cancelTamdokSourceRequests } from "@/parsers/tamdok/runtime";
import { getChapterProgress } from "@/services/manga-tracking";
import {
  peekMangaDetailCache,
  readMangaDetailCache,
} from "@/services/manga-detail-cache";
import {
  peekReaderPageCache,
  writeReaderPageCache,
} from "@/services/reader-page-cache";
import { findInstalledSource } from "@/services/sources";
import { decodeMangaKey, mangaFromParams } from "@/utils/manga-route";
import { findAdjacentChapter } from "@/utils/reader-chapters";
import { filterRenderablePages } from "@/utils/reader-pages";
import {
  prefetchReaderUrls,
  READER_PRELOAD_AHEAD,
} from "@/utils/reader-prefetch";
import { setReaderSlowMode, waitForSlowTurn } from "@/utils/reader-slow-mode";
import { getMangaSlowMode } from "@/services/reader-manga-settings";
import { useTheme } from "@/hooks/use-theme";
import { ErrorState } from "@/components/ui/error-state";

const PRELOAD_DELAY_MS = 600;
// A source request that has not answered in this long is treated as failed, so the reader
// shows an error with a retry button instead of spinning forever.
const PAGE_LIST_TIMEOUT_MS = 45_000;

// Rejects if `promise` does not settle within `ms`. The underlying request keeps running; its
// late result is simply ignored.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function decodeParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function samePages(a: Page[], b: Page[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (left !== right && JSON.stringify(left) !== JSON.stringify(right)) {
      return false;
    }
  }
  return true;
}

function sameChapters(a: Chapter[], b: Chapter[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (left === right) continue;
    if (
      left.key !== right.key ||
      left.title !== right.title ||
      left.chapterNumber !== right.chapterNumber ||
      left.locked !== right.locked
    ) {
      return false;
    }
  }
  return true;
}

function prefetchPageImages(
  pages: Page[],
  headers?: Record<string, string>,
  from = 0,
) {
  prefetchReaderUrls(
    pages.slice(from, from + READER_PRELOAD_AHEAD + 1).map((page) => page.url),
    headers,
  );
}

async function loadPagesForChapter(
  sourceId: string,
  manga: Manga,
  target: Chapter,
  runner: {
    getPageList: (manga: Manga, chapter: Chapter) => Promise<Page[]>;
  } | null,
): Promise<Page[]> {
  const localUrls = await getDownloadedPageUrls(
    sourceId,
    manga.key,
    target.key,
  );
  if (localUrls?.length) return localUrls.map((url) => ({ url }));

  const cachedPages = peekReaderPageCache(sourceId, manga.key, target.key);
  if (cachedPages?.length) return cachedPages;

  if (!runner) return [];
  // Not downloaded and no connection: fail at once instead of waiting for network retries.
  if (await isOffline()) throw new Error(t("reader_offline_chapter"));
  await waitForSlowTurn();
  const nextPages = filterRenderablePages(
    await withTimeout(
      runner.getPageList(manga, target),
      PAGE_LIST_TIMEOUT_MS,
      t("reader_load_timeout"),
    ),
  );
  writeReaderPageCache(sourceId, manga.key, target.key, nextPages);
  return nextPages;
}

function LoadingView() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color="#fff" />
      <View
        style={[
          styles.loadingBack,
          { top: insets.top + Spacing.sm, left: Spacing.lg },
        ]}
      >
        <GlassIconButton
          icon="chevron-back"
          iconColor="#fff"
          glassStyle="clear"
          accessibilityLabel={t("back")}
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}

function ReaderMessage({
  children,
  onRefresh,
}: {
  children: ReactNode;
  onRefresh?: () => void;
}) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.messageContainer}>
      {children}
      {onRefresh ? (
        <Pressable
          style={({ pressed }) => [
            styles.refreshButton,
            { backgroundColor: colors.tint, borderRadius: radius.md },
            pressed && styles.pressed,
          ]}
          onPress={onRefresh}
          accessibilityRole="button"
        >
          <ThemedText variant="headline" color="onTint">
            {t("manga_refresh")}
          </ThemedText>
        </Pressable>
      ) : null}
      <View
        style={[
          styles.loadingBack,
          { top: insets.top + Spacing.sm, left: Spacing.lg },
        ]}
      >
        <GlassIconButton
          icon="chevron-back"
          iconColor="#fff"
          glassStyle="clear"
          accessibilityLabel={t("back")}
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}

const ReaderLoadedContent = memo(function ReaderLoadedContent({
  sourceId,
  manga,
  chapter,
  chapters,
  pages,
  initialPage,
  loadChapterPages,
  onStatusBarHiddenChange,
  startAtEnd,
  mangaPageUrl,
  showModeHint,
}: {
  showModeHint: boolean;
  mangaPageUrl?: string;
  sourceId: string;
  manga: Manga;
  chapter: Chapter;
  chapters: Chapter[];
  pages: Page[];
  initialPage: number;
  loadChapterPages: (chapter: Chapter) => Promise<Page[]>;
  onStatusBarHiddenChange?: (hidden: boolean) => void;
  startAtEnd: boolean;
}) {
  const coverHeaders = useSourceCoverHeaders();
  const headersReady = useSourceCoverHeadersReady();

  useEffect(() => {
    if (!headersReady) return;
    prefetchPageImages(pages, coverHeaders, initialPage);
  }, [coverHeaders, headersReady, pages, initialPage]);

  useEffect(() => {
    if (!headersReady) return;
    const next = findAdjacentChapter(chapters, chapter.key, "next", true);
    const previous = findAdjacentChapter(
      chapters,
      chapter.key,
      "previous",
      true,
    );
    if (!next && !previous) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        if (next) {
          try {
            const nextPages = await loadChapterPages(next);
            if (cancelled) return;
            prefetchPageImages(nextPages, coverHeaders);
          } catch {}
        }
        if (previous && !cancelled) {
          try {
            await loadChapterPages(previous);
          } catch {}
        }
      })();
    }, PRELOAD_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chapter.key, chapters, coverHeaders, headersReady, loadChapterPages]);

  if (!headersReady) return <LoadingView />;

  return (
    <ReaderView
      showModeHint={showModeHint}
      mangaPageUrl={mangaPageUrl}
      sourceId={sourceId}
      manga={manga}
      chapter={chapter}
      chapters={chapters}
      pages={pages}
      initialPage={initialPage}
      coverHeaders={coverHeaders}
      loadChapterPages={loadChapterPages}
      onStatusBarHiddenChange={onStatusBarHiddenChange}
    />
  );
});

export default function MangaReaderScreen() {
  const params = useLocalSearchParams<{
    sourceId: string;
    mangaKey: string;
    chapterKey: string;
    chapterTitle?: string;
    mangaTitle?: string;
    cover?: string;
    page?: string;
    switched?: string;
  }>();
  const sourceRoute = decodeParam(params.sourceId);
  const mangaKey = decodeParam(params.mangaKey);
  const chapterKey = decodeMangaKey(decodeParam(params.chapterKey));
  const pageParam = decodeParam(params.page);
  const startAtEnd = pageParam === "last";
  const pageFromRoute =
    pageParam === "" || startAtEnd ? null : Number(pageParam);
  const { installed } = useSources();
  const source = findInstalledSource(installed, sourceRoute);
  const manifestSourceId = source?.id ?? sourceRoute;
  const { runner, error, isLoading: runnerLoading } = useSourceRunner(source);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [resumePage, setResumePage] = useState<number | null>(() =>
    startAtEnd
      ? 0
      : pageFromRoute != null &&
          Number.isFinite(pageFromRoute) &&
          pageFromRoute >= 0
        ? pageFromRoute
        : null,
  );
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);
  const [statusBarHidden, setStatusBarHidden] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const inflightRef = useRef(new Map<string, Promise<Page[]>>());
  const activeRequestsRef = useRef(0);
  const sourceIdRef = useRef(manifestSourceId);
  sourceIdRef.current = manifestSourceId;

  const track = useCallback(<T,>(promise: Promise<T>): Promise<T> => {
    activeRequestsRef.current += 1;
    return promise.finally(() => {
      activeRequestsRef.current -= 1;
    });
  }, []);

  useEffect(
    () => () => {
      if (activeRequestsRef.current <= 0) return;
      const sourceId = sourceIdRef.current;
      void getDownloads()
        .then((entries) =>
          entries.some(
            (entry) =>
              entry.sourceId === sourceId && entry.status === "downloading",
          ),
        )
        .catch(() => false)
        .then((busy) => {
          if (busy) return;
          cancelAidokuSourceRequests(sourceId);
          cancelTamdokSourceRequests(sourceId);
        });
    },
    [],
  );

  const manga = useMemo(() => {
    const fromParams = mangaFromParams(
      manifestSourceId,
      mangaKey,
      decodeParam(params.mangaTitle),
      decodeParam(params.cover),
    );
    const cached = peekMangaDetailCache(manifestSourceId, mangaKey)?.manga;
    if (!cached) return fromParams;
    return {
      ...cached,
      key: fromParams.key,
      title: fromParams.title || cached.title,
      cover: fromParams.cover || cached.cover,
    };
  }, [manifestSourceId, mangaKey, params.cover, params.mangaTitle]);

  const mangaPageUrl = useMemo(
    () => resolveMangaPageUrl(manga, source?.manifest.info.url),
    [manga, source?.manifest.info.url],
  );

  const chapter: Chapter = useMemo(() => {
    const cached = peekMangaDetailCache(
      manifestSourceId,
      mangaKey,
    )?.manga.chapters?.find((item) => item.key === chapterKey);
    return (
      cached ?? { key: chapterKey, title: decodeParam(params.chapterTitle) }
    );
  }, [chapterKey, manifestSourceId, mangaKey, params.chapterTitle]);

  const hasSourceRef = useRef(Boolean(source));
  hasSourceRef.current = Boolean(source);

  const applyPages = useCallback((next: Page[]) => {
    setPages((previous) => (samePages(previous, next) ? previous : next));
  }, []);

  const slowModeReady = useMemo(
    () =>
      getMangaSlowMode(manifestSourceId, mangaKey)
        .then((value) => setReaderSlowMode(value))
        .catch(() => undefined),
    [manifestSourceId, mangaKey],
  );

  useEffect(() => () => setReaderSlowMode(false), []);

  const applyChapters = useCallback((next: Chapter[]) => {
    setChapters((previous) => (sameChapters(previous, next) ? previous : next));
  }, []);

  useEffect(() => {
    if (resumePage != null) return;
    let cancelled = false;
    getChapterProgress(manifestSourceId, mangaKey, chapterKey)
      .then((progress) => {
        if (!cancelled) {
          setResumePage(progress && progress.page >= 0 ? progress.page : 0);
        }
      })
      .catch(() => {
        if (!cancelled) setResumePage(0);
      });
    return () => {
      cancelled = true;
    };
  }, [resumePage, manifestSourceId, mangaKey, chapterKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadContent() {
      setContentError(null);

      const localUrls = await getDownloadedPageUrls(
        manifestSourceId,
        mangaKey,
        chapterKey,
      );
      if (cancelled) return;
      if (localUrls?.length) {
        applyPages(localUrls.map((url) => ({ url })));
        setContentLoading(false);
        return;
      }

      const cachedPages = peekReaderPageCache(
        manifestSourceId,
        mangaKey,
        chapterKey,
      );
      if (cachedPages?.length) {
        applyPages(cachedPages);
        setContentLoading(false);
      } else {
        setContentLoading(true);
      }

      if (!runner) {
        if (!cachedPages?.length && !hasSourceRef.current) {
          setContentLoading(false);
        }
        return;
      }

      try {
        // The chapter is not stored on the device. Without a connection there is nothing to wait for.
        if (!cachedPages?.length && (await isOffline())) {
          throw new Error(t("reader_offline_chapter"));
        }
        await slowModeReady;
        await waitForSlowTurn();
        const nextPages = filterRenderablePages(
          await track(
            withTimeout(
              runner.getPageList(manga, chapter),
              PAGE_LIST_TIMEOUT_MS,
              t("reader_load_timeout"),
            ),
          ),
        );
        if (cancelled) return;
        applyPages(nextPages);
        writeReaderPageCache(manifestSourceId, mangaKey, chapterKey, nextPages);
      } catch (loadError) {
        if (!cancelled && !cachedPages?.length) {
          setContentError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    }

    void loadContent();
    return () => {
      cancelled = true;
    };
  }, [
    runner,
    manga,
    chapter,
    manifestSourceId,
    mangaKey,
    chapterKey,
    reloadTick,
    applyPages,
    track,
  ]);

  const pagesReady = pages.length > 0;

  useEffect(() => {
    let cancelled = false;

    async function loadChapters() {
      // Memory first, then the copy saved on disk (survives app restarts and works offline).
      const memory =
        peekMangaDetailCache(manifestSourceId, mangaKey)?.manga.chapters ?? [];
      if (memory.length > 0) {
        applyChapters(memory);
        return;
      }
      const stored = await readMangaDetailCache(
        manifestSourceId,
        mangaKey,
      ).catch(() => null);
      if (cancelled) return;
      const fromDisk = stored?.manga.chapters ?? [];
      if (fromDisk.length > 0) {
        applyChapters(fromDisk);
        return;
      }
      if (!runner || (contentLoading && !pagesReady)) return;
      if (await isOffline()) return;
      try {
        const detail = await track(runner.getMangaUpdate(manga, false, true));
        if (!cancelled) applyChapters(detail.chapters ?? []);
      } catch {
        // The chapter list is optional for reading the current chapter.
      }
    }

    void loadChapters();
    return () => {
      cancelled = true;
    };
  }, [
    runner,
    manga,
    manifestSourceId,
    mangaKey,
    contentLoading,
    pagesReady,
    applyChapters,
    track,
  ]);

  const loadChapterPages = useCallback(
    (target: Chapter) => {
      const existing = inflightRef.current.get(target.key);
      if (existing) return existing;
      const promise = track(
        loadPagesForChapter(manifestSourceId, manga, target, runner),
      ).finally(() => {
        inflightRef.current.delete(target.key);
      });
      inflightRef.current.set(target.key, promise);
      return promise;
    },
    [manifestSourceId, manga, runner, track],
  );

  const handleRefresh = useCallback(
    () => setReloadTick((value) => value + 1),
    [],
  );

  const combinedError = error ?? contentError;
  const isLoading =
    resumePage == null ||
    (runnerLoading && pages.length === 0) ||
    (contentLoading && pages.length === 0);

  const readerScreenOptions = useMemo(
    () => ({
      headerShown: false as const,
      animation: "slide_from_right" as const,
      gestureDirection: "horizontal" as const,
      statusBarStyle: "light" as const,
      statusBarAnimation: "fade" as const,
      statusBarHidden,
      autoHideHomeIndicator: statusBarHidden,
      contentStyle: { backgroundColor: "#000" },
    }),
    [statusBarHidden],
  );

  let body: ReactNode;
  if (combinedError && pages.length === 0) {
    body = (
      <ReaderMessage>
        <ErrorState message={combinedError} onRetry={handleRefresh} onDark />
      </ReaderMessage>
    );
  } else if (isLoading) {
    body = <LoadingView />;
  } else if (pages.length === 0) {
    body = (
      <ReaderMessage onRefresh={handleRefresh}>
        <EmptyState icon="images-outline" title={t("reader_no_pages")} />
      </ReaderMessage>
    );
  } else {
    body = (
      <SourceCoverHeadersProvider source={source}>
        <ReaderLoadedContent
          showModeHint={decodeParam(params.switched) !== "1"}
          mangaPageUrl={mangaPageUrl}
          sourceId={manifestSourceId}
          manga={manga}
          chapter={chapter}
          chapters={chapters}
          pages={pages}
          initialPage={
            startAtEnd
              ? Math.max(0, pages.length - 1)
              : Math.min(resumePage ?? 0, Math.max(0, pages.length - 1))
          }
          startAtEnd={startAtEnd}
          loadChapterPages={loadChapterPages}
          onStatusBarHiddenChange={setStatusBarHidden}
        />
      </SourceCoverHeadersProvider>
    );
  }

  return (
    <>
      <Stack.Screen options={readerScreenOptions} />
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  loadingBack: {
    position: "absolute",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  messageContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  buttons: {
    width: "60%",
    gap: Spacing.md,
  },
  refreshButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    alignItems: "center",
  },
  backButton: {
    padding: Spacing.md,
    alignItems: "center",
  },
  pressed: {
    opacity: 0.72,
  },
});
