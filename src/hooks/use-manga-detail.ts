import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { t } from '@/constants/locales';
import { useAidokuSourceRequests } from '@/hooks/use-aidoku-source-requests';
import type { InstalledSource, Manga } from '@/parsers/shared/types';
import type { SourceRunner } from '@/parsers/shared/source-runner';
import { isAidokuRequestCancelled } from '@/parsers/aidoku/wasm-bridge';
import { peekMangaDetailCache, readMangaDetailCache, writeMangaDetailCache } from '@/services/manga-detail-cache';

const MANGA_LOAD_TIMEOUT_MS = 45_000;

type UseMangaDetailOptions = {
  source: InstalledSource | undefined;
  runner: SourceRunner | null;
  initialManga: Manga;
  cacheSourceId: string;
};

function readCachedManga(cacheSourceId: string, mangaKey: string): MangaDetailCacheSnapshot | null {
  const cached = peekMangaDetailCache(cacheSourceId, mangaKey);
  if (!cached) return null;
  return {
    manga: cached.manga,
    hasCachedContent: true,
    isLoading: false,
  };
}

type MangaDetailCacheSnapshot = {
  manga: Manga;
  hasCachedContent: boolean;
  isLoading: boolean;
};

export function useMangaDetail({ source, runner, initialManga, cacheSourceId }: UseMangaDetailOptions) {
  const mangaKey = initialManga.key;
  const cachedSnapshot = readCachedManga(cacheSourceId, mangaKey);
  const [manga, setManga] = useState<Manga>(cachedSnapshot?.manga ?? initialManga);
  const [isLoading, setIsLoading] = useState(cachedSnapshot?.isLoading ?? true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasCachedContent, setHasCachedContent] = useState(cachedSnapshot?.hasCachedContent ?? false);
  const requestIdRef = useRef(0);
  const mangaRef = useRef(initialManga);
  mangaRef.current = manga;

  // Cancels in-flight Aidoku fetches when user navigates away from this source.
  useAidokuSourceRequests(source?.id, source?.kind === 'aidoku');

  useLayoutEffect(() => {
    requestIdRef.current += 1;

    const cached = readCachedManga(cacheSourceId, mangaKey);
    if (cached) {
      setManga(cached.manga);
      setHasCachedContent(true);
      setIsLoading(false);
    } else {
      setManga(initialManga);
      setHasCachedContent(false);
      setIsLoading(true);
    }

    setLoadError(null);
    setIsRefreshing(false);
  }, [cacheSourceId, mangaKey, initialManga]);

  const fetchManga = useCallback(
    async (options?: { force?: boolean }) => {
      if (!cacheSourceId) {
        setIsLoading(false);
        return;
      }

      let hadCachedContent = peekMangaDetailCache(cacheSourceId, mangaKey) != null;

      if (!options?.force) {
        const cached = await readMangaDetailCache(cacheSourceId, mangaKey);
        if (cached) {
          setManga(cached.manga);
          setHasCachedContent(true);
          hadCachedContent = true;
          setIsLoading(false);
        }
      }

      if (!runner || !source) {
        if (!hadCachedContent) {
          setIsLoading(false);
        }
        return;
      }

      const requestId = ++requestIdRef.current;
      // Ignore stale responses when user switched manga before fetch finished.
      const hasDisplayedContent =
        hadCachedContent ||
        Boolean(options?.force) ||
        Boolean(mangaRef.current.chapters?.length) ||
        Boolean(mangaRef.current.description?.trim());

      if (hadCachedContent || options?.force) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      if (!hasDisplayedContent || options?.force) {
        setLoadError(null);
      }

      let timedOut = false;
      const timeout = setTimeout(() => {
        if (requestId !== requestIdRef.current) return;
        timedOut = true;
        if (!hasDisplayedContent) {
          setLoadError(t('source_home_timeout'));
          setIsLoading(false);
        }
        setIsRefreshing(false);
      }, MANGA_LOAD_TIMEOUT_MS);

      try {
        let currentManga = initialManga;
        if (options?.force) {
          currentManga = mangaRef.current;
        } else if (hadCachedContent) {
          currentManga = (await readMangaDetailCache(cacheSourceId, mangaKey))?.manga ?? mangaRef.current;
        }

        const updated = await runner.getMangaUpdate(currentManga, true, true);
        if (requestId !== requestIdRef.current || timedOut) return;

        setManga(updated);
        setLoadError(null);
        setHasCachedContent(true);
        await writeMangaDetailCache(cacheSourceId, mangaKey, {
          manga: updated,
          cachedAt: Date.now(),
        });
      } catch (error) {
        if (requestId !== requestIdRef.current || timedOut) return;
        if (isAidokuRequestCancelled(error)) return;
        const message = error instanceof Error ? error.message : String(error);
        setLoadError(message);
      } finally {
        clearTimeout(timeout);
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [runner, source, initialManga, cacheSourceId, mangaKey],
  );

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      if (!cancelled) {
        void fetchManga();
      }
    };

    const hadCachedContent = peekMangaDetailCache(cacheSourceId, mangaKey) != null;
    if (hadCachedContent) {
      const timer = setTimeout(run, 1);
      return () => {
        cancelled = true;
        requestIdRef.current += 1;
        clearTimeout(timer);
      };
    }

    run();
    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [fetchManga, cacheSourceId, runner?.sourceId, mangaKey]);

  const refresh = useCallback(() => {
    void fetchManga({ force: true });
  }, [fetchManga]);

  const dismissError = useCallback(() => {
    setLoadError(null);
  }, []);

  return {
    manga,
    isLoading,
    isRefreshing,
    loadError,
    hasCachedContent,
    refresh,
    dismissError,
  };
}
