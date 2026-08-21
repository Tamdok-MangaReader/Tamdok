import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { MangaGrid } from '@/components/manga/manga-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenContent } from '@/components/ui/screen-content';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useSources } from '@/context/sources-context';
import { useAidokuSourceRequests } from '@/hooks/use-aidoku-source-requests';
import { useSourceRunner } from '@/hooks/use-source-runner';
import type { Listing, Manga } from '@/parsers/shared/types';
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

export default function SourceListingScreen() {
  const router = useRouter();
  const { id: rawId, listingId, listingName } = useLocalSearchParams<{ id: string; listingId: string; listingName?: string }>();
  const sourceRoute = decodeSourceRouteId(rawId ?? '');
  const { installed } = useSources();
  const source = findInstalledSource(installed, sourceRoute);
  const { runner, error, isLoading: runnerLoading } = useSourceRunner(source);
  const [entries, setEntries] = useState<Manga[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  useAidokuSourceRequests(source?.id, source?.kind === 'aidoku');

  const listing = useMemo<Listing>(
    () => ({
      id: listingId ?? 'popular',
      name: listingName,
      kind: 'grid',
    }),
    [listingId, listingName],
  );

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!runner?.getMangaList) return;
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      try {
        const result = await runner.getMangaList(listing, nextPage);
        if (requestId !== requestIdRef.current) return;
        setEntries((current) => (append ? [...current, ...result.entries] : result.entries));
        setHasNextPage(result.hasNextPage);
        setPage(nextPage);
      } catch (error) {
        if (requestId !== requestIdRef.current || isAidokuRequestCancelled(error)) return;
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [runner, listing],
  );

  useEffect(() => {
    if (!runner) return;
    void load(1, false);
    return () => {
      requestIdRef.current += 1;
    };
  }, [runner, listing.id, load]);

  const openManga = (manga: Manga) => {
    if (!source) return;
    router.navigate(mangaHref(sourceRouteId(source), manga));
  };

  const centerContent = !error && (!runner?.getMangaList || runnerLoading || (isLoading && entries.length === 0) || entries.length === 0);

  if (!source) {
    return (
      <>
        <Stack.Screen options={{ title: t('sources') }} />
        <ScreenContent centerContent>
          <EmptyState icon='alert-circle-outline' title={t('sources_not_found')} />
        </ScreenContent>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: listingName ?? listing.id }} />
      <ScreenContent padded={false} centerContent={centerContent} scrollable={false}>
        {error ? (
          <View style={styles.errorWrap}>
            <ThemedText variant='body' color='destructive'>
              {error}
            </ThemedText>
          </View>
        ) : !runner?.getMangaList ? (
          <EmptyState icon='alert-circle-outline' title={t('sources_listing_unsupported')} />
        ) : runnerLoading || (isLoading && entries.length === 0) ? (
          <ActivityIndicator />
        ) : entries.length === 0 ? (
          <EmptyState icon='book-outline' title={t('sources_browse_empty')} />
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
          </View>
        )}
      </ScreenContent>
    </>
  );
}

const styles = StyleSheet.create({
  gridWrap: {
    flex: 1,
    width: '100%',
  },
  errorWrap: {
    width: '100%',
    paddingHorizontal: Spacing.lg,
  },
});
