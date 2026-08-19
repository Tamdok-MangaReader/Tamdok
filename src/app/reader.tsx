import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ReaderView } from '@/components/reader/reader-view';
import { EmptyState } from '@/components/ui/empty-state';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import {
  SourceCoverHeadersProvider,
  useSourceCoverHeaders,
  useSourceCoverHeadersReady,
} from '@/context/source-cover-context';
import { useSources } from '@/context/sources-context';
import { useSourceRunner } from '@/hooks/use-source-runner';
import type { Chapter, Manga, Page } from '@/parsers/shared/types';
import { getDownloadedPageUrls } from '@/services/downloads';
import { getChapterProgress } from '@/services/manga-tracking';
import { peekMangaDetailCache } from '@/services/manga-detail-cache';
import { peekReaderPageCache, writeReaderPageCache } from '@/services/reader-page-cache';
import { findInstalledSource } from '@/services/sources';
import { decodeMangaKey, mangaFromParams } from '@/utils/manga-route';
import { findAdjacentChapter } from '@/utils/reader-chapters';
import { filterRenderablePages } from '@/utils/reader-pages';
import { prefetchReaderUrls, READER_PRELOAD_AHEAD } from '@/utils/reader-prefetch';

function decodeParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function prefetchPageImages(pages: Page[], headers?: Record<string, string>) {
  prefetchReaderUrls(
    pages.slice(0, READER_PRELOAD_AHEAD + 1).map((page) => page.url),
    headers,
  );
}

async function loadPagesForChapter(
  sourceId: string,
  manga: Manga,
  target: Chapter,
  runner: { getPageList: (manga: Manga, chapter: Chapter) => Promise<Page[]> } | null,
): Promise<Page[]> {
  // Prefer offline downloads, then warm cache, then live source fetch.
  const localUrls = await getDownloadedPageUrls(sourceId, manga.key, target.key);
  if (localUrls?.length) return localUrls.map((url) => ({ url }));

  const cachedPages = peekReaderPageCache(sourceId, manga.key, target.key);
  if (cachedPages?.length) return cachedPages;

  if (!runner) return [];
  const nextPages = filterRenderablePages(await runner.getPageList(manga, target));
  writeReaderPageCache(sourceId, manga.key, target.key, nextPages);
  return nextPages;
}

function ReaderLoadedContent({
  sourceId,
  manga,
  chapter,
  chapters,
  pages,
  initialPage,
  loadChapterPages,
  onStatusBarHiddenChange,
}: {
  sourceId: string;
  manga: Manga;
  chapter: Chapter;
  chapters: Chapter[];
  pages: Page[];
  initialPage: number;
  loadChapterPages: (chapter: Chapter) => Promise<Page[]>;
  onStatusBarHiddenChange?: (hidden: boolean) => void;
}) {
  const coverHeaders = useSourceCoverHeaders();
  const headersReady = useSourceCoverHeadersReady();

  useEffect(() => {
    if (!headersReady) return;
    prefetchPageImages(pages, coverHeaders);
  }, [coverHeaders, headersReady, pages]);

  useEffect(() => {
    if (!headersReady) return;
    const nextChapter = findAdjacentChapter(chapters, chapter.key, 'next', true);
    if (!nextChapter) return;
    const cached = peekReaderPageCache(sourceId, manga.key, nextChapter.key);
    if (cached) prefetchPageImages(cached, coverHeaders);
  }, [chapter.key, chapters, coverHeaders, headersReady, manga.key, sourceId]);

  if (!headersReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator color='#fff' />
      </View>
    );
  }

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
}

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
  const pageFromRoute = pageParam === '' ? null : Number(pageParam);
  const { installed } = useSources();
  const source = findInstalledSource(installed, sourceRoute);
  const manifestSourceId = source?.id ?? sourceRoute;
  const { runner, error, isLoading: runnerLoading } = useSourceRunner(source);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [resumePage, setResumePage] = useState<number | null>(
    pageFromRoute != null && Number.isFinite(pageFromRoute) && pageFromRoute >= 0 ? pageFromRoute : null,
  );
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);
  const [statusBarHidden, setStatusBarHidden] = useState(false);

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
    const cached = peekMangaDetailCache(manifestSourceId, mangaKey)?.manga.chapters?.find(
      (item) => item.key === chapterKey,
    );
    return cached ?? { key: chapterKey, title: decodeParam(params.chapterTitle) };
  }, [chapterKey, manifestSourceId, mangaKey, params.chapterTitle]);

  useEffect(() => {
    let cancelled = false;

    async function loadContent() {
      setContentError(null);

      if (resumePage == null) {
        try {
          const progress = await getChapterProgress(manifestSourceId, mangaKey, chapterKey);
          if (!cancelled) {
            setResumePage(progress && progress.page >= 0 ? progress.page : 0);
          }
        } catch {
          if (!cancelled) setResumePage(0);
        }
      }

      const cachedChapters = peekMangaDetailCache(manifestSourceId, mangaKey)?.manga.chapters ?? [];
      if (cachedChapters.length > 0) {
        setChapters(cachedChapters);
      }

      const localUrls = await getDownloadedPageUrls(manifestSourceId, mangaKey, chapterKey);
      if (localUrls?.length) {
        if (!cancelled) {
          setPages(localUrls.map((url) => ({ url })));
          setContentLoading(false);
        }
        return;
      }

      const cachedPages = peekReaderPageCache(manifestSourceId, mangaKey, chapterKey);
      if (cachedPages?.length) {
        if (!cancelled) {
          setPages(cachedPages);
          setContentLoading(false);
        }
      } else {
        setContentLoading(true);
      }

      if (!runner) {
        if (!cancelled && !cachedPages?.length) setContentLoading(false);
        return;
      }

      try {
        const nextPages = filterRenderablePages(await runner.getPageList(manga, chapter));
        if (cancelled) return;
        setPages(nextPages);
        writeReaderPageCache(manifestSourceId, mangaKey, chapterKey, nextPages);
      } catch (loadError) {
        if (!cancelled && !cachedPages?.length) {
          setContentError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }

      if (cachedChapters.length === 0) {
        try {
          const detail = await runner.getMangaUpdate(manga, false, true);
          if (!cancelled) setChapters(detail.chapters ?? []);
        } catch {
          // Chapter list is optional for reading; don't block the reader.
        }
      }
    }

    void loadContent();
    return () => {
      cancelled = true;
    };
  }, [runner, manga, chapter, manifestSourceId, mangaKey, chapterKey]);

  useEffect(() => {
    if (!runner || chapters.length === 0) return;

    const adjacent = [
      findAdjacentChapter(chapters, chapterKey, 'previous', true),
      findAdjacentChapter(chapters, chapterKey, 'next', true),
    ].filter((item): item is Chapter => Boolean(item));

    let cancelled = false;
    void (async () => {
      for (const item of adjacent) {
        try {
          await loadPagesForChapter(manifestSourceId, manga, item, runner);
          if (cancelled) return;
        } catch {
          // Prefetch is best-effort.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chapterKey, chapters, manifestSourceId, manga, mangaKey, runner]);

  const loadChapterPages = useCallback(
    (target: Chapter) => loadPagesForChapter(manifestSourceId, manga, target, runner),
    [manifestSourceId, manga, runner],
  );

  const combinedError = error ?? contentError;
  const isLoading =
    resumePage == null || (runnerLoading && pages.length === 0) || (contentLoading && pages.length === 0);
  const readerScreenOptions = useMemo(
    () => ({
      headerShown: false as const,
      animation: 'slide_from_right' as const,
      gestureDirection: 'horizontal' as const,
      statusBarStyle: 'light' as const,
      statusBarAnimation: 'fade' as const,
      statusBarHidden,
      autoHideHomeIndicator: statusBarHidden,
      contentStyle: { backgroundColor: '#000' },
    }),
    [statusBarHidden],
  );

  return (
    <>
      <Stack.Screen options={readerScreenOptions} />
      {combinedError && pages.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg }}>
          <ThemedText variant='body' color='destructive'>
            {combinedError}
          </ThemedText>
        </View>
      ) : isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
          <ActivityIndicator color='#fff' />
        </View>
      ) : pages.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState icon='images-outline' title={t('reader_no_pages')} />
        </View>
      ) : (
        <SourceCoverHeadersProvider source={source}>
          <ReaderLoadedContent
            sourceId={manifestSourceId}
            manga={manga}
            chapter={chapter}
            chapters={chapters}
            pages={pages}
            initialPage={Math.min(resumePage ?? 0, Math.max(0, pages.length - 1))}
            loadChapterPages={loadChapterPages}
            onStatusBarHiddenChange={setStatusBarHidden}
          />
        </SourceCoverHeadersProvider>
      )}
    </>
  );
}
