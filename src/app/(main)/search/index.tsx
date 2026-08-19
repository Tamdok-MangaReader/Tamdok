import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, type ScrollViewProps } from 'react-native';

import {
  DEFAULT_GLOBAL_SEARCH_FILTERS,
  filterInstalledForSearch,
  GlobalSearchFilterBar,
  type GlobalSearchFilters,
} from '@/components/search/global-search-filter-bar';
import { GlobalSearchSourceSection, type SourceSearchGroup } from '@/components/search/global-search-source-section';
import { EmptyState } from '@/components/ui/empty-state';
import { LiquidGlassScrollComponent } from '@/components/ui/liquid-glass-scroll-root';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useNavigationTheme } from '@/hooks/use-navigation-theme';
import { useSources } from '@/context/sources-context';
import type { InstalledSource, Manga } from '@/parsers/shared/types';
import { sanitizeAidokuInvokeError } from '@/parsers/aidoku/errors';
import {
  isAidokuRequestCancelled,
  releaseAidokuSourceRequests,
  retainAidokuSourceRequests,
} from '@/parsers/aidoku/wasm-bridge';
import { createSourceRunner, sourceRouteId } from '@/services/sources';
import { filterMangaByContent } from '@/utils/global-search-filters';
import { mangaHref } from '@/utils/manga-route';

export default function SearchScreen() {
  const router = useRouter();
  const { stackSearchBarProps, isDark } = useNavigationTheme();
  const { installed } = useSources();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<GlobalSearchFilters>(DEFAULT_GLOBAL_SEARCH_FILTERS);
  const [groups, setGroups] = useState<SourceSearchGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenerationRef = useRef(0);

  const trimmedQuery = query.trim();
  const searchSources = useMemo(() => filterInstalledForSearch(installed, filters), [installed, filters]);

  const visibleGroups = useMemo(
    () =>
      groups.filter(
        (group) => group.status === 'loading' || group.status === 'error' || group.entries.length > 0,
      ),
    [groups],
  );

  const isSearchActive = trimmedQuery.length > 0;
  const anyLoading = visibleGroups.some((group) => group.status === 'loading');
  const anyErrors = visibleGroups.some((group) => group.status === 'error');
  const totalResults = useMemo(
    () => visibleGroups.reduce((sum, group) => sum + group.entries.length, 0),
    [visibleGroups],
  );
  const searchFinished = isSearchActive && visibleGroups.length > 0 && !anyLoading;
  const showNoResults = searchFinished && totalResults === 0 && !anyErrors;
  const noSourcesForFilters = searchSources.length === 0;

  const searchOneSource = useCallback(
    async (source: InstalledSource, text: string, generation: number) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (generation === searchGenerationRef.current) {
        setGroups((previous) =>
          previous.map((group) =>
            sourceRouteId(group.source) === sourceRouteId(source)
              ? { ...group, entries: [], status: 'loading', error: undefined }
              : group,
          ),
        );
      }

      try {
        const runner = await createSourceRunner(source);
        const page = await runner.getSearchMangaList({ query: trimmed, page: 1 });
        const entries = filterMangaByContent(page.entries, filters.contentFilter);
        if (generation !== searchGenerationRef.current) return;
        setGroups((previous) =>
          previous.map((group) =>
            sourceRouteId(group.source) === sourceRouteId(source)
              ? { ...group, entries, status: 'done', error: undefined }
              : group,
          ),
        );
      } catch (searchError) {
        if (isAidokuRequestCancelled(searchError) || generation !== searchGenerationRef.current) return;
        const message =
          searchError instanceof Error
            ? sanitizeAidokuInvokeError(searchError.message)
            : sanitizeAidokuInvokeError(String(searchError));
        setGroups((previous) =>
          previous.map((group) =>
            sourceRouteId(group.source) === sourceRouteId(source)
              ? { ...group, entries: [], status: 'error', error: message }
              : group,
          ),
        );
      }
    },
    [filters.contentFilter],
  );

  const runSearch = useCallback(
    async (text: string, generation: number) => {
      const trimmed = text.trim();
      if (!trimmed || searchSources.length === 0) {
        if (generation === searchGenerationRef.current) {
          setGroups([]);
        }
        return;
      }

      if (generation === searchGenerationRef.current) {
        setGroups(
          searchSources.map(
            (source): SourceSearchGroup => ({
              source,
              entries: [],
              status: 'loading',
            }),
          ),
        );
        setError(null);
      }

      await Promise.all(searchSources.map((source) => searchOneSource(source, trimmed, generation)));
    },
    [searchOneSource, searchSources],
  );

  const retrySource = useCallback(
    (source: InstalledSource) => {
      const generation = ++searchGenerationRef.current;
      void searchOneSource(source, query, generation);
    },
    [query, searchOneSource],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const generation = ++searchGenerationRef.current;
      void runSearch(query, generation);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  useEffect(() => {
    if (!trimmedQuery) return;
    const ids = searchSources.filter((source) => source.kind === 'aidoku').map((source) => source.id);
    for (const id of ids) retainAidokuSourceRequests(id);
    return () => {
      searchGenerationRef.current += 1;
      for (const id of ids) releaseAidokuSourceRequests(id);
    };
  }, [searchSources, trimmedQuery]);

  const filterBar = useMemo(
    () => <GlobalSearchFilterBar installed={installed} filters={filters} onChange={setFilters} />,
    [installed, filters],
  );

  const renderListHeader = useCallback(() => filterBar, [filterBar]);

  const renderEmptyComponent = () => {
    if (error) {
      return (
        <View style={styles.errorWrap}>
          <ThemedText variant='body' color='destructive'>
            {error}
          </ThemedText>
        </View>
      );
    }

    if (!isSearchActive) {
      return null;
    }

    if (noSourcesForFilters) {
      return (
        <View style={styles.centered}>
          <EmptyState icon='funnel-outline' title={t('search_filter_no_sources_title')} description={t('search_filter_no_sources_desc')} />
        </View>
      );
    }

    if (showNoResults) {
      return (
        <View style={styles.centered}>
          <EmptyState icon='search-outline' title={t('search_no_results')} />
        </View>
      );
    }

    return null;
  };

  const openManga = useCallback(
    (source: InstalledSource, manga: Manga) => {
      router.push(mangaHref(source, manga));
    },
    [router],
  );

  const openSource = useCallback(
    (source: InstalledSource) => {
      router.push(`/sources/${encodeURIComponent(sourceRouteId(source))}`);
    },
    [router],
  );

  const showResultsList = isSearchActive && visibleGroups.length > 0;
  const showIdleEmpty = !error && !isSearchActive;

  return (
    <>
      <Stack.Title>{t('search')}</Stack.Title>
      <Stack.SearchBar
        key={isDark ? 'search-dark' : 'search-light'}
        placement='automatic'
        placeholder={t('search_placeholder')}
        {...stackSearchBarProps}
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onSearchButtonPress={(event) => setQuery(event.nativeEvent.text)}
      />
      {showIdleEmpty ? (
        <ThemedView color='groupedBackground' style={styles.root}>
          <View style={styles.idleCenter}>
            {installed.length === 0 ? (
              <EmptyState icon='globe-outline' title={t('sources_empty_title')} description={t('sources_empty_desc')} />
            ) : (
              <EmptyState icon='search-outline' title={t('search_empty_title')} description={t('search_empty_desc')} />
            )}
          </View>
        </ThemedView>
      ) : (
        <ThemedView color='groupedBackground' style={styles.root}>
          <FlatList
            style={styles.list}
            data={showResultsList ? visibleGroups : []}
            keyExtractor={(item) => sourceRouteId(item.source)}
            contentContainerStyle={[
              styles.listContent,
              !showResultsList && styles.listContentEmpty,
            ]}
            contentInsetAdjustmentBehavior='automatic'
            automaticallyAdjustsScrollIndicatorInsets
            ListHeaderComponent={isSearchActive ? renderListHeader : undefined}
            ListEmptyComponent={renderEmptyComponent}
            renderScrollComponent={(props: ScrollViewProps) => <LiquidGlassScrollComponent {...props} />}
            renderItem={({ item }) => (
              <GlobalSearchSourceSection
                group={item}
                resetKey={`${trimmedQuery}:${filters.contentFilter}:${filters.sourceRouteIds.join(',')}:${filters.languages.join(',')}`}
                onPressSource={openSource}
                onPressManga={openManga}
                onRetry={retrySource}
              />
            )}
          />
        </ThemedView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  idleCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  centered: {
    flexGrow: 1,
    minHeight: 320,
    justifyContent: 'center',
    alignItems: 'center',
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
  errorWrap: {
    width: '100%',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
});
