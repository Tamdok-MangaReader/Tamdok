import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MangaGrid } from '@/components/manga/manga-grid';
import { MangaSearchFilterBar } from '@/components/sources/manga-search-filter-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassIconButton } from '@/components/ui/glass-icon-button';
import { GlassSurface } from '@/components/ui/glass-surface';
import { ScreenContent } from '@/components/ui/screen-content';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useSources } from '@/context/sources-context';
import { useAidokuSourceRequests } from '@/hooks/use-aidoku-source-requests';
import { useSourceFilters } from '@/hooks/use-source-filters';
import { useSourceRunner } from '@/hooks/use-source-runner';
import { useTheme } from '@/hooks/use-theme';
import { mergeFilterValues } from '@/parsers/shared/filters';
import type { FilterValue, Manga } from '@/parsers/shared/types';
import { isAidokuRequestCancelled } from '@/parsers/aidoku/wasm-bridge';
import { findInstalledSource, sourceRouteId } from '@/services/sources';
import { mangaHref } from '@/utils/manga-route';

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
  const { id: rawId, q, filters: rawFilters } = useLocalSearchParams<{ id: string; q?: string; filters?: string }>();
  const sourceRoute = decodeSourceRouteId(rawId ?? '');
  const initialQuery = typeof q === 'string' ? q : '';
  const { installed } = useSources();
  const source = findInstalledSource(installed, sourceRoute);
  const { runner, error, isLoading: runnerLoading } = useSourceRunner(source);
  const { definitions, values: filters, setValues: setFilters, isLoading: filtersLoading } = useSourceFilters(runner);
  const [query, setQuery] = useState(initialQuery);
  const [entries, setEntries] = useState<Manga[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useAidokuSourceRequests(source?.id, source?.kind === 'aidoku');

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!rawFilters || typeof rawFilters !== 'string') return;
    try {
      const parsed = JSON.parse(rawFilters) as FilterValue[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setFilters((current) => mergeFilterValues(parsed.length > 0 ? parsed : current, definitions));
      }
    } catch {
      // Ignore malformed deep-link filters.
    }
  }, [rawFilters, definitions, setFilters]);

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!runner) return;
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await runner.getSearchMangaList({ page: nextPage, query, filters });
        if (requestId !== requestIdRef.current) return;
        setEntries((current) => (append ? [...current, ...result.entries] : result.entries));
        setHasNextPage(result.hasNextPage);
        setPage(nextPage);
      } catch (loadErr) {
        if (requestId !== requestIdRef.current) return;
        if (isAidokuRequestCancelled(loadErr)) return;
        setLoadError(loadErr instanceof Error ? loadErr.message : String(loadErr));
        if (!append) {
          setEntries([]);
          setHasNextPage(false);
        }
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [runner, query, filters],
  );

  useEffect(() => {
    if (!runner || filtersLoading) return;
    const timer = setTimeout(() => {
      void load(1, false);
    }, 400);
    return () => {
      requestIdRef.current += 1;
      clearTimeout(timer);
    };
  }, [runner, query, filters, load, filtersLoading]);

  const submitQuery = () => {
    router.setParams({ q: query });
  };

  const openManga = (manga: Manga) => {
    if (!source) return;
    router.push(mangaHref(sourceRouteId(source), manga));
  };

  const displayError = error ?? loadError;
  const centerContent =
    !displayError &&
    (runnerLoading || filtersLoading || (isLoading && entries.length === 0) || entries.length === 0);

  if (!source) {
    return (
      <ScreenContent centerContent>
        <EmptyState icon='alert-circle-outline' title={t('sources_not_found')} />
      </ScreenContent>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.root, { backgroundColor: colors.systemBackground }]}
      keyboardVerticalOffset={0}>
      <View style={[styles.searchHeader, { paddingTop: insets.top + Spacing.xs }]}>
        <GlassSurface style={styles.searchRow} borderRadius={radius.pill} interactive>
          <View style={styles.searchRowInner}>
            <Ionicons name='search' size={18} color={colors.tertiaryLabel} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.label }]}
              placeholder={t('search_placeholder')}
              placeholderTextColor={colors.tertiaryLabel}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={submitQuery}
              returnKeyType='search'
              autoFocus
              clearButtonMode='while-editing'
              keyboardAppearance={isDark ? 'dark' : 'light'}
            />
          </View>
        </GlassSurface>
        <GlassIconButton
          icon='close'
          onPress={() => router.back()}
          size={44}
          iconSize={22}
          iconColor={colors.destructive}
          accessibilityLabel={t('cancel')}
        />
      </View>

      {definitions.length > 0 ? (
        <MangaSearchFilterBar definitions={definitions} values={filters} onChange={setFilters} />
      ) : null}

      <ScreenContent padded={false} centerContent={centerContent} scrollable={false}>
        {displayError ? (
          <View style={styles.errorWrap}>
            <ThemedText variant='body' color='destructive'>
              {displayError}
            </ThemedText>
          </View>
        ) : runnerLoading || filtersLoading || (isLoading && entries.length === 0) ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
            <ThemedText variant='subheadline' color='secondaryLabel' style={styles.loadingLabel}>
              {t('search_loading')}
            </ThemedText>
          </View>
        ) : entries.length === 0 ? (
          <EmptyState icon='search-outline' title={t('sources_browse_empty')} />
        ) : (
          <View style={styles.gridWrap}>
            <MangaGrid
              entries={entries}
              sourceId={source?.id}
              onPressManga={openManga}
              onEndReached={() => {
                if (!isLoading && hasNextPage) void load(page + 1, true);
              }}
              ListFooterComponent={isLoading ? <ActivityIndicator style={{ paddingVertical: Spacing.lg }} /> : null}
            />
            {isLoading ? (
              <View style={styles.searchOverlay} pointerEvents='none'>
                <View style={[styles.searchOverlayCard, { backgroundColor: colors.secondaryFill }]}>
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
    flexDirection: 'row',
    alignItems: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
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
    width: '100%',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingLabel: {
    textAlign: 'center',
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: Spacing.xl,
  },
  searchOverlayCard: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorWrap: {
    width: '100%',
    paddingHorizontal: Spacing.lg,
  },
});
