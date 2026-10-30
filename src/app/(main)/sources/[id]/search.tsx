import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useHeaderHeight } from "@react-navigation/elements";

import { MangaGrid, type MangaGridItem } from "@/components/manga/manga-grid";
import { MangaSearchFilterBar } from "@/components/sources/manga-search-filter-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { GlassSurface } from "@/components/ui/glass-surface";
import { ScreenContent } from "@/components/ui/screen-content";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useSources } from "@/context/sources-context";
import { useAidokuSourceRequests } from "@/hooks/use-aidoku-source-requests";
import { useSourceFilters } from "@/hooks/use-source-filters";
import { useSourceRunner } from "@/hooks/use-source-runner";
import { useTheme } from "@/hooks/use-theme";
import { mergeFilterValues } from "@/parsers/shared/filters";
import type { FilterValue, Manga } from "@/parsers/shared/types";
import { isAidokuRequestCancelled } from "@/parsers/aidoku/wasm-bridge";
import { findInstalledSource, sourceRouteId } from "@/services/sources";
import { mangaHref } from "@/utils/manga-route";

const SEARCH_DEBOUNCE_MS = 400;
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
  const insets = useSafeAreaInsets();
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
  const listRef = useRef<FlatList<MangaGridItem>>(null);
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
  }, [initialQuery]);

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
          if (!append) return result.entries;
          const seen = new Set(current.map((manga) => manga.key));
          const fresh = result.entries.filter((manga) => !seen.has(manga.key));
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
      listRef.current?.scrollToOffset({ offset: -headerHeight, animated: true });
      void load(1, false);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      requestIdRef.current += 1;
      busyRef.current = false;
      clearTimeout(timer);
    };
  }, [runner, query, filters, load, filtersLoading, headerHeight]);

  const submitQuery = useCallback(() => {
    router.setParams({ q: query });
  }, [router, query]);

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

  const handleCancel = useCallback(() => router.back(), [router]);

  const footer = useMemo(
    () =>
      isLoadingMore ? <ActivityIndicator style={FOOTER_SPINNER_STYLE} /> : null,
    [isLoadingMore],
  );

  const searchHeaderStyle = useMemo(
    () => [styles.searchHeader, { paddingTop: insets.top + Spacing.xs }],
    [insets.top],
  );
  const rootStyle = useMemo(
    () => [styles.root, { backgroundColor: colors.systemBackground }],
    [colors.systemBackground],
  );
  const overlayCardStyle = useMemo(
    () => [styles.searchOverlayCard, { backgroundColor: colors.secondaryFill }],
    [colors.secondaryFill],
  );
  const searchInputStyle = useMemo(
    () => [styles.searchInput, { color: colors.label }],
    [colors.label],
  );

  const displayError = error ?? loadError;
  const showInitialLoading =
    runnerLoading || filtersLoading || (isLoading && entries.length === 0);
  const centerContent =
    !displayError && (runnerLoading || filtersLoading || entries.length === 0);
  const showRating = entries.length > 0 && entries[0]!.rating !== undefined;

  if (!source) {
    return (
      <ScreenContent centerContent>
        <EmptyState
          icon="alert-circle-outline"
          title={t("sources_not_found")}
        />
      </ScreenContent>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={rootStyle}
      keyboardVerticalOffset={0}
    >
      <View style={searchHeaderStyle}>
        <GlassSurface
          style={styles.searchRow}
          borderRadius={radius.pill}
          interactive
        >
          <View style={styles.searchRowInner}>
            <Ionicons
              name="search"
              size={18}
              color={colors.tertiaryLabel}
              style={styles.searchIcon}
            />
            <TextInput
              style={searchInputStyle}
              placeholder={t("search_placeholder")}
              placeholderTextColor={colors.tertiaryLabel}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={submitQuery}
              returnKeyType="search"
              autoFocus
              clearButtonMode="while-editing"
              keyboardAppearance={isDark ? "dark" : "light"}
            />
          </View>
        </GlassSurface>
        <GlassIconButton
          icon="close"
          onPress={handleCancel}
          size={44}
          iconSize={22}
          iconColor={colors.destructive}
          accessibilityLabel={t("cancel")}
        />
      </View>

      {definitions.length > 0 ? (
        <MangaSearchFilterBar
          definitions={definitions}
          values={filters}
          onChange={setFilters}
        />
      ) : null}

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
          <EmptyState icon="search-outline" title={t("sources_browse_empty")} />
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  searchRow: {
    flex: 1,
    minHeight: 44,
  },
  searchRowInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: Spacing.md,
  },
  searchIcon: {
    marginRight: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    paddingVertical: Spacing.sm,
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
