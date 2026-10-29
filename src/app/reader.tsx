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

import { ReaderView } from "@/components/reader/reader-view";
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
import { getDownloadedPageUrls } from "@/services/downloads";
import { getChapterProgress } from "@/services/manga-tracking";
import { peekMangaDetailCache } from "@/services/manga-detail-cache";
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
import { useTheme } from "@/hooks/use-theme";

const PRELOAD_DELAY_MS = 600;

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
  const nextPages = filterRenderablePages(
    await runner.getPageList(manga, target),
  );
  writeReaderPageCache(sourceId, manga.key, target.key, nextPages);
  return nextPages;
}

function LoadingView() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}

function ReaderMessage({
  children,
  onRefresh,
}: {
  children: ReactNode;
  onRefresh: () => void;
}) {
  const { colors, radius } = useTheme();
  const handleBack = useCallback(() => router.back(), []);

  return (
    <View style={styles.messageContainer}>
      {children}
      <View style={styles.buttons}>
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
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.destructive, borderRadius: radius.md },
            pressed && styles.pressed,
          ]}
          onPress={handleBack}
          accessibilityRole="button"
        >
          <ThemedText variant="headline" color="onTint">
            {t("back")}
          </ThemedText>
        </Pressable>
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
}: {
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

  const chapter: Chapter = useMemo(() => {
    const cached = peekMangaDetailCache(
      manifestSourceId,
      mangaKey,
    )?.manga.chapters?.find((item) => item.key === chapterKey);
    return (
      cached ?? { key: chapterKey, title: decodeParam(params.chapterTitle) }
    );
  }, [chapterKey, manifestSourceId, mangaKey, params.chapterTitle]);

  const applyPages = useCallback((next: Page[]) => {
    setPages((previous) => (samePages(previous, next) ? previous : next));
  }, []);

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
        if (!cachedPages?.length) setContentLoading(false);
        return;
      }

      try {
        const nextPages = filterRenderablePages(
          await runner.getPageList(manga, chapter),
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
  ]);

  const pagesReady = pages.length > 0;

  useEffect(() => {
    const cached =
      peekMangaDetailCache(manifestSourceId, mangaKey)?.manga.chapters ?? [];
    if (cached.length > 0) {
      applyChapters(cached);
      return;
    }
    if (!runner || (contentLoading && !pagesReady)) return;

    let cancelled = false;
    runner
      .getMangaUpdate(manga, false, true)
      .then((detail) => {
        if (!cancelled) applyChapters(detail.chapters ?? []);
      })
      .catch(() => {});
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
  ]);

  const loadChapterPages = useCallback(
    (target: Chapter) => {
      const existing = inflightRef.current.get(target.key);
      if (existing) return existing;
      const promise = loadPagesForChapter(
        manifestSourceId,
        manga,
        target,
        runner,
      ).finally(() => {
        inflightRef.current.delete(target.key);
      });
      inflightRef.current.set(target.key, promise);
      return promise;
    },
    [manifestSourceId, manga, runner],
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
      <ReaderMessage onRefresh={handleRefresh}>
        <ThemedText variant="body" color="destructive">
          {combinedError}
        </ThemedText>
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
    padding: Spacing.md,
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
