import { useCallback, useEffect, useRef, useState } from 'react';

import { useAidokuSourceRequests } from '@/hooks/use-aidoku-source-requests';
import type { HomeLayout, InstalledSource, Listing } from '@/parsers/shared/types';
import type { SourceRunner } from '@/parsers/shared/source-runner';
import { isAidokuRequestCancelled } from '@/parsers/aidoku/wasm-bridge';
import { readSourceHomeCache, writeSourceHomeCache } from '@/services/source-home-cache';
import { loadSourceHomeData } from '@/services/source-home-loader';

const HOME_LOAD_TIMEOUT_MS = 90_000;
const NHENTAI_HOME_LOAD_TIMEOUT_MS = 90_000;
const NHENTAI_SOURCE_ID = 'multi.nhentai';

type UseSourceHomeOptions = {
  source: InstalledSource | undefined;
  runner: SourceRunner | null;
};

export function useSourceHome({ source, runner }: UseSourceHomeOptions) {
  const [home, setHome] = useState<HomeLayout | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasCachedContent, setHasCachedContent] = useState(false);
  const requestIdRef = useRef(0);

  useAidokuSourceRequests(source?.id, source?.kind === 'aidoku');

  const fetchHome = useCallback(
    async (options?: { force?: boolean; fromPull?: boolean }) => {
      if (!source) {
        setIsLoading(false);
        return;
      }

      const manifestListings = source.manifest.listings ?? [];
      let hadCachedContent = false;

      if (!options?.force) {
        const cached = await readSourceHomeCache(source.id);
        if (cached) {
          setHome(cached.home);
          setListings(cached.listings);
          setHasCachedContent(true);
          hadCachedContent = true;
          setIsLoading(false);
        }
      }

      if (!runner) {
        if (!hadCachedContent) {
          setIsLoading(false);
        }
        return;
      }

      const requestId = ++requestIdRef.current;
      const homeTimeoutMs = source.id === NHENTAI_SOURCE_ID ? NHENTAI_HOME_LOAD_TIMEOUT_MS : HOME_LOAD_TIMEOUT_MS;

      if (hadCachedContent || options?.fromPull) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      if (!hadCachedContent || options?.force) {
        setLoadError(null);
      }

      // Stop the pull spinner if the home request hangs; cached tiles stay visible.
      let timedOut = false;
      const timeout = setTimeout(() => {
        if (requestId !== requestIdRef.current) return;
        timedOut = true;
        setIsRefreshing(false);
      }, homeTimeoutMs);

      try {
        const result = await loadSourceHomeData(runner, source, manifestListings);
        if (requestId !== requestIdRef.current) return;

        setHome(result.home);
        setListings(result.listings);
        setLoadError(null);
        setHasCachedContent(true);
        await writeSourceHomeCache(source.id, {
          home: result.home,
          listings: result.listings,
          cachedAt: Date.now(),
        });
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        if (isAidokuRequestCancelled(error)) return;
        const message = error instanceof Error ? error.message : String(error);
        setLoadError(message);
        if (!hadCachedContent && !timedOut) {
          setHome({ components: [] });
          setListings(manifestListings);
        }
      } finally {
        clearTimeout(timeout);
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [runner, source],
  );

  useEffect(() => {
    void fetchHome();
    return () => {
      // Invalidate in-flight fetches when leaving this source tab.
      requestIdRef.current += 1;
    };
  }, [fetchHome, source?.id, runner?.sourceId]);

  const refresh = useCallback(() => {
    void fetchHome({ force: true, fromPull: true });
  }, [fetchHome]);

  const dismissError = useCallback(() => {
    setLoadError(null);
  }, []);

  return {
    home,
    listings,
    isLoading,
    isRefreshing,
    loadError,
    hasCachedContent,
    refresh,
    dismissError,
  };
}
