import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { t } from "@/constants/locales";
import { useAidokuSourceRequests } from "@/hooks/use-aidoku-source-requests";
import type { InstalledSource, Manga } from "@/parsers/shared/types";
import type { SourceRunner } from "@/parsers/shared/source-runner";
import {
  cancelAidokuSourceRequests,
  cancelAidokuSourceRequestsBefore,
  isAidokuRequestCancelled,
} from "@/parsers/aidoku/wasm-bridge";
import {
  cancelTamdokSourceRequests,
  cancelTamdokSourceRequestsBefore,
} from "@/parsers/tamdok/runtime";
import {
  peekMangaDetailCache,
  readMangaDetailCache,
  writeMangaDetailCache,
} from "@/services/manga-detail-cache";
import {
  getLibraryEntry,
  syncLibraryEntryUnread,
  updateLibraryEntryMetadata,
} from "@/services/library";

const MANGA_LOAD_TIMEOUT_MS = 45_000;

type UseMangaDetailOptions = {
  source: InstalledSource | undefined;
  runner: SourceRunner | null;
  initialManga: Manga;
  cacheSourceId: string;
};

function readCachedManga(
  cacheSourceId: string,
  mangaKey: string,
): MangaDetailCacheSnapshot | null {
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

// Manga fetches in flight per source and when each started. A screen that closes only cancels
// requests older than the newest fetch of another screen, never the one opened right after it.
const activeFetches = new Map<string, Map<symbol, number>>();

function registerFetch(sourceId: string, token: symbol): void {
  let entry = activeFetches.get(sourceId);
  if (!entry) {
    entry = new Map();
    activeFetches.set(sourceId, entry);
  }
  entry.set(token, Date.now());
}

function unregisterFetch(sourceId: string, token: symbol): void {
  const entry = activeFetches.get(sourceId);
  if (!entry) return;
  entry.delete(token);
  if (entry.size === 0) activeFetches.delete(sourceId);
}

function newestFetchStart(sourceId: string): number | null {
  const entry = activeFetches.get(sourceId);
  if (!entry || entry.size === 0) return null;
  return Math.max(...entry.values());
}

// Lets the screen render the fresh chapters and answer taps before the persistence work starts.
function afterInteractions(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 400));
}

export function useMangaDetail({
  source,
  runner,
  initialManga,
  cacheSourceId,
}: UseMangaDetailOptions) {
  const mangaKey = initialManga.key;
  const cachedSnapshot = readCachedManga(cacheSourceId, mangaKey);
  const [manga, setManga] = useState<Manga>(
    cachedSnapshot?.manga ?? initialManga,
  );
  const [isLoading, setIsLoading] = useState(cachedSnapshot?.isLoading ?? true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasCachedContent, setHasCachedContent] = useState(
    cachedSnapshot?.hasCachedContent ?? false,
  );
  const requestIdRef = useRef(0);
  const fetchTokenRef = useRef<symbol | null>(null);
  const activeFetchRef = useRef(0);
  const sourceIdRef = useRef(source?.id);
  sourceIdRef.current = source?.id;
  const mangaRef = useRef(initialManga);
  mangaRef.current = manga;

  // Cancels in-flight Aidoku fetches when user navigates away from this source.
  useAidokuSourceRequests(source?.id);

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

      let hadCachedContent =
        peekMangaDetailCache(cacheSourceId, mangaKey) != null;

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
      activeFetchRef.current = requestId;
      if (fetchTokenRef.current) unregisterFetch(source.id, fetchTokenRef.current);
      const fetchToken = Symbol("manga-fetch");
      fetchTokenRef.current = fetchToken;
      registerFetch(source.id, fetchToken);
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
          setLoadError(t("source_home_timeout"));
          setIsLoading(false);
        }
        setIsRefreshing(false);
      }, MANGA_LOAD_TIMEOUT_MS);

      try {
        let currentManga = initialManga;
        if (options?.force) {
          currentManga = mangaRef.current;
        } else if (hadCachedContent) {
          currentManga =
            (await readMangaDetailCache(cacheSourceId, mangaKey))?.manga ??
            mangaRef.current;
        }

        const updated = await runner.getMangaUpdate(currentManga, true, true);
        const stale = requestId !== requestIdRef.current || timedOut;

        if (!stale) {
          setManga(updated);
          setLoadError(null);
          setHasCachedContent(true);
        }
        // Persisting a long chapter list (serialising it, rewriting the known chapters) is heavy work on the
        // JS thread, so it waits until the screen has settled instead of competing with taps and navigation.
        await afterInteractions();
        await writeMangaDetailCache(cacheSourceId, mangaKey, {
          manga: updated,
          cachedAt: Date.now(),
        });
        if (await getLibraryEntry(cacheSourceId, mangaKey)) {
          await updateLibraryEntryMetadata(cacheSourceId, mangaKey, {
            title: updated.title,
            cover: updated.cover,
            status: updated.status,
            lastRefreshed: Date.now(),
          });
          await afterInteractions();
          await syncLibraryEntryUnread(
            cacheSourceId,
            mangaKey,
            updated.chapters,
          );
        }
      } catch (error) {
        if (requestId !== requestIdRef.current || timedOut) return;
        if (isAidokuRequestCancelled(error)) return;
        const message = error instanceof Error ? error.message : String(error);
        setLoadError(message);
      } finally {
        clearTimeout(timeout);
        unregisterFetch(source.id, fetchToken);
        if (fetchTokenRef.current === fetchToken) fetchTokenRef.current = null;
        if (activeFetchRef.current === requestId) activeFetchRef.current = 0;
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

    const hadCachedContent =
      peekMangaDetailCache(cacheSourceId, mangaKey) != null;
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

  useEffect(
    () => () => {
      const sourceId = sourceIdRef.current;
      if (!sourceId || activeFetchRef.current === 0) return;
      activeFetchRef.current = 0;
      const own = fetchTokenRef.current;
      fetchTokenRef.current = null;
      if (own) unregisterFetch(sourceId, own);
      const newestOther = newestFetchStart(sourceId);
      if (newestOther == null) {
        cancelAidokuSourceRequests(sourceId);
        cancelTamdokSourceRequests(sourceId);
        return;
      }
      // Another manga of the same source is already loading: abort only what started before it, so
      // leaving a screen never cancels the request of the one opened next.
      cancelAidokuSourceRequestsBefore(sourceId, newestOther);
      cancelTamdokSourceRequestsBefore(sourceId, newestOther);
    },
    [cacheSourceId, mangaKey],
  );

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
