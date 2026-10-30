import { useHeaderHeight } from "@react-navigation/elements";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  View,
  type ListRenderItemInfo,
  type ScrollViewProps,
} from "react-native";

import {
  DEFAULT_GLOBAL_SEARCH_FILTERS,
  filterInstalledForSearch,
  GlobalSearchFilterBar,
  type GlobalSearchFilters,
} from "@/components/search/global-search-filter-bar";
import {
  GlobalSearchSourceSection,
  type SourceSearchGroup,
} from "@/components/search/global-search-source-section";
import { EmptyState } from "@/components/ui/empty-state";
import { LiquidGlassScrollComponent } from "@/components/ui/liquid-glass-scroll-root";
import { ThemedView } from "@/components/ui/themed-view";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useNavigationTheme } from "@/hooks/use-navigation-theme";
import { useSources } from "@/context/sources-context";
import type { InstalledSource, Manga } from "@/parsers/shared/types";
import { sanitizeAidokuInvokeError } from "@/parsers/aidoku/errors";
import {
  isAidokuRequestCancelled,
  releaseAidokuSourceRequests,
  retainAidokuSourceRequests,
} from "@/parsers/aidoku/wasm-bridge";
import { createSourceRunner, sourceRouteId } from "@/services/sources";
import { filterMangaByContent } from "@/utils/global-search-filters";
import { mangaHref } from "@/utils/manga-route";

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_CONCURRENCY = 4;
const PATCH_FLUSH_MS = 80;

type ContentFilter = GlobalSearchFilters["contentFilter"];

type FilteredCacheEntry = {
  raw: SourceSearchGroup;
  filter: ContentFilter;
  result: SourceSearchGroup;
};

async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const lane = async () => {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      await worker(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );
}

const keyExtractor = (item: SourceSearchGroup) => sourceRouteId(item.source);

const renderScrollComponent = (props: ScrollViewProps) => (
  <LiquidGlassScrollComponent {...props} />
);

export default function SearchScreen() {
  const router = useRouter();
  const { stackSearchBarProps, isDark } = useNavigationTheme();
  const { installed } = useSources();
  const headerHeight = useHeaderHeight();
  const listRef = useRef<FlatList<SourceSearchGroup>>(null);
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [filters, setFilters] = useState<GlobalSearchFilters>(
    DEFAULT_GLOBAL_SEARCH_FILTERS,
  );
  const [rawGroups, setRawGroups] = useState<SourceSearchGroup[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const tokensRef = useRef(new Map<string, number>());
  const pendingRef = useRef(new Map<string, Partial<SourceSearchGroup>>());
  const sourcesRef = useRef<InstalledSource[]>([]);
  const filterCacheRef = useRef(new Map<string, FilteredCacheEntry>());
  const queryRef = useRef(query);
  queryRef.current = query;

  const trimmedQuery = query.trim();
  const isSearchActive = trimmedQuery.length > 0;
  const contentFilter = filters.contentFilter;

  const computedSources = useMemo(
    () => filterInstalledForSearch(installed, filters),
    [installed, filters],
  );

  const searchSources = useMemo(() => {
    const previous = sourcesRef.current;
    if (
      previous.length === computedSources.length &&
      previous.every((source, index) => source === computedSources[index])
    ) {
      return previous;
    }
    sourcesRef.current = computedSources;
    return computedSources;
  }, [computedSources]);

  const noSourcesForFilters = searchSources.length === 0;

  const groups = useMemo(() => {
    const previousCache = filterCacheRef.current;
    const nextCache = new Map<string, FilteredCacheEntry>();
    const result = rawGroups.map((raw) => {
      const id = sourceRouteId(raw.source);
      const cached = previousCache.get(id);
      if (cached && cached.raw === raw && cached.filter === contentFilter) {
        nextCache.set(id, cached);
        return cached.result;
      }
      const entries =
        raw.status === "done"
          ? filterMangaByContent(raw.entries, contentFilter)
          : raw.entries;
      const filtered = entries === raw.entries ? raw : { ...raw, entries };
      nextCache.set(id, { raw, filter: contentFilter, result: filtered });
      return filtered;
    });
    filterCacheRef.current = nextCache;
    return result;
  }, [rawGroups, contentFilter]);

  const view = useMemo(() => {
    const visible: SourceSearchGroup[] = [];
    let anyLoading = false;
    let anyErrors = false;
    let total = 0;
    for (const group of groups) {
      if (group.status === "loading") {
        anyLoading = true;
        visible.push(group);
      } else if (group.status === "error") {
        anyErrors = true;
        visible.push(group);
      } else if (group.entries.length > 0) {
        total += group.entries.length;
        visible.push(group);
      }
    }
    return { visible, anyLoading, anyErrors, total };
  }, [groups]);

  const searchFinished =
    isSearchActive && view.visible.length > 0 && !view.anyLoading;
  const showNoResults = searchFinished && view.total === 0 && !view.anyErrors;
  const showResultsList = isSearchActive && view.visible.length > 0;

  const clearPending = useCallback(() => {
    pendingRef.current = new Map();
    if (flushRef.current) {
      clearTimeout(flushRef.current);
      flushRef.current = null;
    }
  }, []);

  const flushPatches = useCallback(() => {
    flushRef.current = null;
    const patches = pendingRef.current;
    if (patches.size === 0) return;
    pendingRef.current = new Map();
    setRawGroups((previous) =>
      previous.map((group) => {
        const patch = patches.get(sourceRouteId(group.source));
        return patch ? { ...group, ...patch } : group;
      }),
    );
  }, []);

  const queuePatch = useCallback(
    (id: string, patch: Partial<SourceSearchGroup>) => {
      pendingRef.current.set(id, patch);
      if (!flushRef.current)
        flushRef.current = setTimeout(flushPatches, PATCH_FLUSH_MS);
    },
    [flushPatches],
  );

  const createGuard = useCallback((id: string, generation: number) => {
    const token = (tokensRef.current.get(id) ?? 0) + 1;
    tokensRef.current.set(id, token);
    return () =>
      generation === generationRef.current &&
      tokensRef.current.get(id) === token;
  }, []);

  const searchOneSource = useCallback(
    async (source: InstalledSource, text: string, isCurrent: () => boolean) => {
      const id = sourceRouteId(source);
      try {
        const runner = await createSourceRunner(source);
        if (!isCurrent()) return;
        const page = await runner.getSearchMangaList({ query: text, page: 1 });
        if (!isCurrent()) return;
        queuePatch(id, {
          entries: page.entries,
          status: "done",
          error: undefined,
        });
      } catch (searchError) {
        if (isAidokuRequestCancelled(searchError) || !isCurrent()) return;
        const message =
          searchError instanceof Error
            ? sanitizeAidokuInvokeError(searchError.message)
            : sanitizeAidokuInvokeError(String(searchError));
        queuePatch(id, { entries: [], status: "error", error: message });
      }
    },
    [queuePatch],
  );

  const runSearch = useCallback(
    async (text: string, generation: number) => {
      if (generation !== generationRef.current) return;
      clearPending();
      const trimmed = text.trim();
      if (!trimmed || searchSources.length === 0) {
        setRawGroups((previous) => (previous.length === 0 ? previous : []));
        return;
      }

      setRawGroups(
        searchSources.map((source): SourceSearchGroup => ({
          source,
          entries: [],
          status: "loading",
        })),
      );

      await runPool(searchSources, SEARCH_CONCURRENCY, async (source) => {
        if (generation !== generationRef.current) return;
        await searchOneSource(
          source,
          trimmed,
          createGuard(sourceRouteId(source), generation),
        );
      });
    },
    [clearPending, createGuard, searchOneSource, searchSources],
  );

  const retrySource = useCallback(
    (source: InstalledSource) => {
      const text = queryRef.current.trim();
      if (!text) return;
      const id = sourceRouteId(source);
      const generation = generationRef.current;
      const isCurrent = createGuard(id, generation);
      pendingRef.current.delete(id);
      setRawGroups((previous) =>
        previous.map((group) =>
          sourceRouteId(group.source) === id
            ? { ...group, entries: [], status: "loading", error: undefined }
            : group,
        ),
      );
      void searchOneSource(source, text, isCurrent);
    },
    [createGuard, searchOneSource],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const generation = ++generationRef.current;
      setCommittedQuery(query.trim());
      void runSearch(query, generation);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  useEffect(() => {
    if (!trimmedQuery) return;
    const ids = searchSources
      .filter((source) => source.kind === "aidoku")
      .map((source) => source.id);
    for (const id of ids) retainAidokuSourceRequests(id);
    return () => {
      generationRef.current += 1;
      for (const id of ids) releaseAidokuSourceRequests(id);
    };
  }, [searchSources, trimmedQuery]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      if (flushRef.current) clearTimeout(flushRef.current);
    },
    [],
  );

  const resetKey = useMemo(
    () =>
      `${committedQuery}:${filters.contentFilter}:${filters.sourceRouteIds.join(",")}:${filters.languages.join(",")}`,
    [
      committedQuery,
      filters.contentFilter,
      filters.sourceRouteIds,
      filters.languages,
    ],
  );

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: -headerHeight, animated: true });
  }, [resetKey, headerHeight]);

  const filterBar = useMemo(
    () => (
      <GlobalSearchFilterBar
        installed={installed}
        filters={filters}
        onChange={setFilters}
      />
    ),
    [installed, filters],
  );

  const openManga = useCallback(
    (source: InstalledSource, manga: Manga) => {
      router.navigate(mangaHref(source, manga));
    },
    [router],
  );

  const openSource = useCallback(
    (source: InstalledSource) => {
      router.navigate(`/sources/${encodeURIComponent(sourceRouteId(source))}`);
    },
    [router],
  );

  const handleSearchText = useCallback(
    (event: { nativeEvent: { text: string } }) => {
      setQuery(event.nativeEvent.text);
    },
    [],
  );

  const emptyComponent = useMemo(() => {
    if (!isSearchActive) return null;

    if (noSourcesForFilters) {
      return (
        <View style={styles.centered}>
          <EmptyState
            icon="funnel-outline"
            title={t("search_filter_no_sources_title")}
            description={t("search_filter_no_sources_desc")}
          />
        </View>
      );
    }

    if (showNoResults) {
      return (
        <View style={styles.centered}>
          <EmptyState icon="search-outline" title={t("search_no_results")} />
        </View>
      );
    }

    return null;
  }, [isSearchActive, noSourcesForFilters, showNoResults]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<SourceSearchGroup>) => (
      <GlobalSearchSourceSection
        group={item}
        resetKey={resetKey}
        onPressSource={openSource}
        onPressManga={openManga}
        onRetry={retrySource}
      />
    ),
    [resetKey, openSource, openManga, retrySource],
  );

  const contentContainerStyle = useMemo(
    () => [styles.listContent, !showResultsList && styles.listContentEmpty],
    [showResultsList],
  );

  const listData = showResultsList ? view.visible : EMPTY_GROUPS;

  return (
    <>
      <Stack.Title>{t("search")}</Stack.Title>
      <Stack.SearchBar
        key={isDark ? "search-dark" : "search-light"}
        placement="automatic"
        placeholder={t("search_placeholder")}
        {...stackSearchBarProps}
        onChangeText={handleSearchText}
        onSearchButtonPress={handleSearchText}
      />
      {!isSearchActive ? (
        <ThemedView color="groupedBackground" style={styles.root}>
          <View style={styles.idleCenter}>
            {installed.length === 0 ? (
              <EmptyState
                icon="globe-outline"
                title={t("sources_empty_title")}
                description={t("sources_empty_desc")}
              />
            ) : (
              <EmptyState
                icon="search-outline"
                title={t("search_empty_title")}
                description={t("search_empty_desc")}
              />
            )}
          </View>
        </ThemedView>
      ) : (
        <ThemedView color="groupedBackground" style={styles.root}>
          <FlatList
            ref={listRef}
            style={styles.list}
            data={listData}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={contentContainerStyle}
            contentInsetAdjustmentBehavior="automatic"
            automaticallyAdjustsScrollIndicatorInsets
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={filterBar}
            ListEmptyComponent={emptyComponent}
            renderScrollComponent={renderScrollComponent}
            initialNumToRender={4}
            maxToRenderPerBatch={3}
            updateCellsBatchingPeriod={50}
            windowSize={5}
            removeClippedSubviews={Platform.OS === "android"}
          />
        </ThemedView>
      )}
    </>
  );
}

const EMPTY_GROUPS: SourceSearchGroup[] = [];

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  idleCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  centered: {
    flexGrow: 1,
    minHeight: 320,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
});
