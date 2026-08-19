import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, View, type RefreshControlProps } from 'react-native';

import { MangaGrid } from '@/components/manga/manga-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import type { Listing, Manga } from '@/parsers/shared/types';
import type { SourceRunner } from '@/parsers/shared/source-runner';

type SourceListingPanelProps = {
  runner: SourceRunner;
  listing: Listing;
  sourceId?: string;
  onPressManga: (manga: Manga) => void;
  listHeader?: ReactElement | null;
  refreshControl?: ReactElement<RefreshControlProps> | null;
};

export function SourceListingPanel({
  runner,
  listing,
  sourceId,
  onPressManga,
  listHeader,
  refreshControl,
}: SourceListingPanelProps) {
  const [entries, setEntries] = useState<Manga[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!runner?.getMangaList) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await runner.getMangaList(listing, nextPage);
        setEntries((current) => (append ? [...current, ...result.entries] : result.entries));
        setHasNextPage(result.hasNextPage);
        setPage(nextPage);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        if (!append) setEntries([]);
      } finally {
        setIsLoading(false);
      }
    },
    [runner, listing],
  );

  useEffect(() => {
    void load(1, false);
  }, [listing.id, load]);

  if (!runner?.getMangaList) {
    return <EmptyState icon='alert-circle-outline' title={t('sources_listing_unsupported')} />;
  }

  if (error && entries.length === 0) {
    return (
      <View style={styles.center}>
        <ThemedText variant='body' color='destructive'>
          {error}
        </ThemedText>
      </View>
    );
  }

  if (isLoading && entries.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (entries.length === 0) {
    return <EmptyState icon='book-outline' title={t('sources_browse_empty')} />;
  }

  return (
    <MangaGrid
      entries={entries}
      sourceId={sourceId}
      onPressManga={onPressManga}
      contentInsetAdjustmentBehavior='automatic'
      ListHeaderComponent={listHeader}
      refreshControl={refreshControl ?? undefined}
      onEndReached={() => {
        if (!isLoading && hasNextPage) void load(page + 1, true);
      }}
      ListFooterComponent={isLoading ? <ActivityIndicator style={{ paddingVertical: Spacing.lg }} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
