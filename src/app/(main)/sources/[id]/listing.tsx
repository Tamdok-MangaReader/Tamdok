import { SourceCoverHeadersProvider } from "@/context/source-cover-context";
import { SourceNotFound } from "@/components/sources/source-not-found";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { MangaGrid } from "@/components/manga/manga-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { ScreenContent } from "@/components/ui/screen-content";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useSources } from "@/context/sources-context";
import { useAidokuSourceRequests } from "@/hooks/use-aidoku-source-requests";
import { useSourceRunner } from "@/hooks/use-source-runner";
import type { Listing, Manga } from "@/parsers/shared/types";
import { isAidokuRequestCancelled } from "@/parsers/aidoku/wasm-bridge";
import { findInstalledSource, sourceRouteId } from "@/services/sources";
import { mangaHref } from "@/utils/manga-route";

const ResultsGrid = memo(MangaGrid);

const FOOTER_SPINNER_STYLE = { paddingVertical: Spacing.lg } as const;

function decodeSourceRouteId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export default function SourceListingScreen() {
  const router = useRouter();
  const {
    id: rawId,
    listingId,
    listingName,
  } = useLocalSearchParams<{
    id: string;
    listingId: string;
    listingName?: string;
  }>();
  const sourceRoute = decodeSourceRouteId(rawId ?? "");
  const { installed } = useSources();
  const source = findInstalledSource(installed, sourceRoute);
  const sourceKey = source ? sourceRouteId(source) : null;
  const sourceId = source?.id;
  const { runner, error, isLoading: runnerLoading } = useSourceRunner(source);
  const [entries, setEntries] = useState<Manga[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const pageRef = useRef(1);
  const hasNextRef = useRef(false);
  const busyRef = useRef(false);

  useAidokuSourceRequests(source?.id);

  const listing = useMemo<Listing>(
    () => ({
      id: listingId ?? "popular",
      name: listingName,
      kind: "grid",
    }),
    [listingId, listingName],
  );

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!runner?.getMangaList) return;
      const requestId = ++requestIdRef.current;
      busyRef.current = true;
      if (append) setIsLoadingMore(true);
      else {
        setIsLoading(true);
        setLoadError(null);
      }
      try {
        const result = await runner.getMangaList(listing, nextPage);
        if (requestId !== requestIdRef.current) return;
        setEntries((current) => {
          if (!append) return result.entries;
          const seen = new Set(current.map((manga) => manga.key));
          const fresh = result.entries.filter((manga) => !seen.has(manga.key));
          return fresh.length > 0 ? [...current, ...fresh] : current;
        });
        hasNextRef.current = result.hasNextPage;
        pageRef.current = nextPage;
      } catch (loadErr) {
        if (
          requestId !== requestIdRef.current ||
          isAidokuRequestCancelled(loadErr)
        ) {
          return;
        }
        if (!append) {
          setLoadError(
            loadErr instanceof Error ? loadErr.message : String(loadErr),
          );
          setEntries([]);
          hasNextRef.current = false;
        }
      } finally {
        if (requestId === requestIdRef.current) {
          busyRef.current = false;
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [runner, listing],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!runner) return;
    void load(1, false);
    return () => {
      requestIdRef.current += 1;
      busyRef.current = false;
    };
  }, [runner, listing.id, load]);

  const openManga = useCallback(
    (manga: Manga) => {
      if (!sourceKey) return;
      router.navigate(mangaHref(sourceKey, manga));
    },
    [router, sourceKey],
  );

  const handleEndReached = useCallback(() => {
    if (busyRef.current || !hasNextRef.current) return;
    void loadRef.current(pageRef.current + 1, true);
  }, []);

  const footer = useMemo(
    () =>
      isLoadingMore ? <ActivityIndicator style={FOOTER_SPINNER_STYLE} /> : null,
    [isLoadingMore],
  );

  const screenOptions = useMemo(
    () => ({ title: listingName ?? listing.id }),
    [listingName, listing.id],
  );

  const displayError = error ?? loadError;
  const supportsListing = Boolean(runner?.getMangaList);
  const showLoading = runnerLoading || (isLoading && entries.length === 0);
  const centerContent =
    !displayError &&
    (!supportsListing || runnerLoading || entries.length === 0);

  if (!source) {
    return (
      <>
        <Stack.Screen options={{ title: t("sources") }} />
        <SourceNotFound />
      </>
    );
  }

  return (
    <SourceCoverHeadersProvider source={source}>
    <>
      <Stack.Screen options={screenOptions} />
      <ScreenContent
        padded={false}
        centerContent={centerContent}
        scrollable={false}
      >
        {displayError ? (
          <View style={styles.errorWrap}>
            <ThemedText variant="body" color="destructive">
              {displayError}
            </ThemedText>
          </View>
        ) : !supportsListing ? (
          <EmptyState
            icon="alert-circle-outline"
            title={t("sources_listing_unsupported")}
          />
        ) : showLoading ? (
          <ActivityIndicator />
        ) : entries.length === 0 ? (
          <EmptyState icon="book-outline" title={t("sources_browse_empty")} />
        ) : (
          <View style={styles.gridWrap}>
            <ResultsGrid
              entries={entries}
              sourceId={sourceId}
              onPressManga={openManga}
              onEndReached={handleEndReached}
              ListFooterComponent={footer}
            />
          </View>
        )}
      </ScreenContent>
    </>
    </SourceCoverHeadersProvider>
  );
}

const styles = StyleSheet.create({
  gridWrap: {
    flex: 1,
    width: "100%",
  },
  errorWrap: {
    width: "100%",
    paddingHorizontal: Spacing.lg,
  },
});
