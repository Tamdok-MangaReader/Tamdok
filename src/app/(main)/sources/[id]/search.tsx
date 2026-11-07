import { uniqueByKey } from "@/utils/unique-entries";
import { SourceCoverHeadersProvider } from "@/context/source-cover-context";
import { SourceNotFound } from "@/components/sources/source-not-found";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import { useHeaderHeight } from "@react-navigation/elements";

import type { FlashListRef } from "@shopify/flash-list";
import { MangaGrid, type MangaGridItem } from "@/components/manga/manga-grid";
import {
  MangaFilterModal,
  MangaSearchFilterBar,
} from "@/components/sources/manga-search-filter-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { ScreenContent } from "@/components/ui/screen-content";
import { ThemedText } from "@/components/ui/themed-text";
import { ErrorState } from "@/components/ui/error-state";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useSources } from "@/context/sources-context";
import { useAidokuSourceRequests } from "@/hooks/use-aidoku-source-requests";
import { useSourceFilters } from "@/hooks/use-source-filters";
import { useSourceRunner } from "@/hooks/use-source-runner";
import { useNavigationTheme } from "@/hooks/use-navigation-theme";
import { useTheme } from "@/hooks/use-theme";
import type { SearchBarCommands } from "react-native-screens";
import { mergeFilterValues } from "@/parsers/shared/filters";
import type { FilterValue, Manga } from "@/parsers/shared/types";
import { isAidokuRequestCancelled } from "@/parsers/aidoku/wasm-bridge";
import { findInstalledSource, sourceRouteId } from "@/services/sources";
import { mangaHref } from "@/utils/manga-route";

const SEARCH_DEBOUNCE_MS = 400;
// Height of the floating filter chips (the chips are 40pt tall).
const FILTER_BAR_HEIGHT = 40;
const FOOTER_SPINNER_STYLE = { paddingVertical: Spacing.lg } as const;

const ResultsGrid = memo(MangaGrid);

function decodeSourceRouteId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export default function SourceSearchScreen() {
  const router = useRouter();
  const { colors, radius, isDark } = useTheme();
  const {
    id: rawId,
    q,
    filters: rawFilters,
  } = useLocalSearchParams<{ id: string; q?: string; filters?: string }>();
  const sourceRoute = decodeSourceRouteId(rawId ?? "");
  const initialQuery = typeof q === "string" ? q : "";
  const { installed } = useSources();
  const source = findInstalledSource(installed, sourceRoute);
  const sourceKey = source ? sourceRouteId(source) : null;
  const sourceId = source?.id;
  const { runner, error, isLoading: runnerLoading } = useSourceRunner(source);
  const {
    definitions,
    values: filters,
    setValues: setFilters,
    isLoading: filtersLoading,
  } = useSourceFilters(runner);
  const headerHeight = useHeaderHeight();
  const { stackSearchBarProps } = useNavigationTheme();
  const searchBarRef = useRef<SearchBarCommands>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const openFilters = useCallback(() => setFiltersOpen(true), []);
  const listRef = useRef<FlashListRef<MangaGridItem>>(null);
  const [query, setQuery] = useState(initialQuery);
  const [entries, setEntries] = useState<Manga[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const pageRef = useRef(1);
  const hasNextRef = useRef(false);
  const busyRef = useRef(false);

  useAidokuSourceRequests(source?.id);

  useEffect(() => {
    setQuery(initialQuery);
    if (initialQuery) searchBarRef.current?.setText(initialQuery);
  }, [initialQuery]);

  const handleSearchText = useCallback(
    (event: { nativeEvent: { text: string } }) => {
      setQuery(event.nativeEvent.text);
    },
    [],
  );

  useEffect(() => {
    if (!rawFilters || typeof rawFilters !== "string") return;
    try {
      const parsed = JSON.parse(rawFilters) as FilterValue[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setFilters(() => mergeFilterValues(parsed, definitions));
      }
    } catch {}
  }, [rawFilters, definitions, setFilters]);

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!runner) return;
      const requestId = ++requestIdRef.current;
      busyRef.current = true;
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);
      setLoadError(null);
      try {
        const result = await runner.getSearchMangaList({
          page: nextPage,
          query,
          filters,
        });
        if (requestId !== requestIdRef.current) return;
        setEntries((current) => {
          if (!append) return uniqueByKey(result.entries);
          const fresh = uniqueByKey(result.entries, current);
          return fresh.length > 0 ? [...current, ...fresh] : current;
        });
        hasNextRef.current = result.hasNextPage;
        pageRef.current = nextPage;
      } catch (loadErr) {
        if (requestId !== requestIdRef.current) return;
        if (isAidokuRequestCancelled(loadErr)) return;
        setLoadError(
          loadErr instanceof Error ? loadErr.message : String(loadErr),
        );
        if (!append) {
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
    [runner, query, filters],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!runner || filtersLoading) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      void load(1, false);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      requestIdRef.current += 1;
      busyRef.current = false;
      clearTimeout(timer);
    };
  }, [runner, query, filters, load, filtersLoading]);

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

  const rootStyle = useMemo(
    () => [styles.root, { backgroundColor: colors.systemBackground }],
    [colors.systemBackground],
  );
  const overlayCardStyle = useMemo(
    () => [styles.searchOverlayCard, { backgroundColor: colors.secondaryFill }],
    [colors.secondaryFill],
  );

  const hasFilterBar = definitions.length > 0;
  // The native header is transparent and the filter bar floats under it; the list reserves both.
  const topInset =
    headerHeight +
    (hasFilterBar ? FILTER_BAR_HEIGHT + Spacing.sm : 0) +
    Spacing.sm;
  const topSpacer = useMemo(
    () => <View style={{ height: topInset }} />,
    [topInset],
  );
  const topSpaceStyle = useMemo(() => ({ paddingTop: topInset }), [topInset]);

  const displayError = error ?? loadError;
  const showInitialLoading =
    runnerLoading || filtersLoading || (isLoading && entries.length === 0);
  const centerContent =
    !displayError && (runnerLoading || filtersLoading || entries.length === 0);
  const showRating = entries.length > 0 && entries[0]!.rating !== undefined;

  if (!source) {
    return <SourceNotFound />;
  }

  return (
    <SourceCoverHeadersProvider source={source}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={rootStyle}
        keyboardVerticalOffset={0}
      >
        {Platform.OS === "ios" && hasFilterBar ? (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              icon="line.3.horizontal.decrease"
              separateBackground
              accessibilityLabel={t("source_search_filters")}
              tintColor={colors.label}
              onPress={openFilters}
            />
          </Stack.Toolbar>
        ) : null}
        <Stack.SearchBar
          ref={searchBarRef}
          key={isDark ? "source-search-dark" : "source-search-light"}
          placeholder={t("search_placeholder")}
          {...stackSearchBarProps}
          placement="integratedButton"
          autoFocus
          onChangeText={handleSearchText}
          onSearchButtonPress={handleSearchText}
          onCancelButtonPress={() =>
            handleSearchText({ nativeEvent: { text: "" } })
          }
          onClose={() => handleSearchText({ nativeEvent: { text: "" } })}
        />
        <View style={styles.flex}>
          <ScreenContent
            padded={false}
            centerContent={centerContent}
            scrollable={false}
            contentContainerStyle={
              entries.length === 0 ? topSpaceStyle : undefined
            }
          >
            {displayError ? (
              <View style={styles.errorWrap}>
                <ErrorState message={displayError} />
              </View>
            ) : showInitialLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator />
                <ThemedText
                  variant="subheadline"
                  color="secondaryLabel"
                  style={styles.loadingLabel}
                >
                  {t("search_loading")}
                </ThemedText>
              </View>
            ) : entries.length === 0 ? (
              <EmptyState
                icon="search-outline"
                title={t("sources_browse_empty")}
              />
            ) : (
              <View style={styles.gridWrap}>
                <ResultsGrid
                  listRef={listRef}
                  entries={entries}
                  sourceId={sourceId}
                  showRating={showRating}
                  isRatingCompact={false}
                  onPressManga={openManga}
                  onEndReached={handleEndReached}
                  ListHeaderComponent={topSpacer}
                  contentInsetAdjustmentBehavior="never"
                  ListFooterComponent={footer}
                />
                {isLoading ? (
                  <View style={styles.searchOverlay} pointerEvents="none">
                    <View style={overlayCardStyle}>
                      <ActivityIndicator color={colors.tint} />
                    </View>
                  </View>
                ) : null}
              </View>
            )}
          </ScreenContent>
          {hasFilterBar ? (
            <View
              style={[styles.topOverlay, { top: headerHeight }]}
              pointerEvents="box-none"
            >
              <MangaSearchFilterBar
                definitions={definitions}
                values={filters}
                onChange={setFilters}
                onOpenFilters={openFilters}
                hideFiltersButton={Platform.OS === "ios"}
              />
            </View>
          ) : null}
          {hasFilterBar ? (
            <MangaFilterModal
              visible={filtersOpen}
              definitions={definitions}
              values={filters}
              onChange={setFilters}
              onClose={() => setFiltersOpen(false)}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SourceCoverHeadersProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  topOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  gridWrap: {
    flex: 1,
    width: "100%",
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingLabel: {
    textAlign: "center",
  },
  searchOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: Spacing.xl,
  },
  searchOverlayCard: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  errorWrap: {
    width: "100%",
    paddingHorizontal: Spacing.lg,
  },
});
