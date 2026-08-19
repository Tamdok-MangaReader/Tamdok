import { Dimensions, FlatList, StyleSheet, type RefreshControlProps, type ScrollViewProps } from 'react-native';

import { MangaCover } from '@/components/manga/manga-cover';
import { LiquidGlassScrollComponent } from '@/components/ui/liquid-glass-scroll-root';
import { Spacing } from '@/constants/theme';
import { useLibraryLookup, enrichMangaWithLibraryMeta } from '@/hooks/use-library-lookup';
import type { Manga } from '@/parsers/shared/types';

export type MangaGridItem = Manga & {
  sourceId?: string;
  inLibrary?: boolean;
  unreadCount?: number;
  downloadedCount?: number;
  updateFailed?: boolean;
};

type MangaGridProps = {
  entries: MangaGridItem[] | Manga[];
  sourceId?: string;
  columns?: number;
  showBookmark?: boolean;
  scaleBadges?: boolean;
  onPressManga: (manga: MangaGridItem) => void;
  onLongPressManga?: (manga: MangaGridItem) => void;
  onEndReached?: () => void;
  ListHeaderComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
  refreshControl?: React.ReactElement<RefreshControlProps> | null;
  extraData?: unknown;
  scrollEnabled?: boolean;
  contentInsetAdjustmentBehavior?: 'automatic' | 'never';
};

export function MangaGrid({
  entries,
  sourceId,
  columns = 3,
  showBookmark = true,
  scaleBadges = false,
  onPressManga,
  onLongPressManga,
  onEndReached,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  refreshControl,
  extraData,
  scrollEnabled = true,
  contentInsetAdjustmentBehavior = 'automatic',
}: MangaGridProps) {
  const width = Dimensions.get('window').width;
  const itemWidth = Math.floor((width - Spacing.lg * 2 - Spacing.sm * (columns - 1)) / columns);
  const { getMeta } = useLibraryLookup();

  return (
    <FlatList
      key={`manga-grid-${columns}`}
      style={styles.root}
      data={entries}
      keyExtractor={(item) => item.key}
      numColumns={columns}
      columnWrapperStyle={columns > 1 ? styles.row : undefined}
      contentContainerStyle={[styles.list, entries.length === 0 ? styles.emptyList : null]}
      contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
      scrollEnabled={scrollEnabled}
      bounces={scrollEnabled}
      renderScrollComponent={(props: ScrollViewProps) => <LiquidGlassScrollComponent {...props} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent}
      refreshControl={refreshControl ?? undefined}
      extraData={extraData}
      renderItem={({ item }) => {
        const enriched = enrichMangaWithLibraryMeta(item, sourceId ?? item.sourceId, getMeta);
        const showMeta = enriched.inLibrary;
        return (
          <MangaCover
            title={item.title}
            cover={item.cover}
            width={itemWidth}
            inLibrary={showMeta}
            unreadCount={enriched.unreadCount}
            downloadedCount={enriched.downloadedCount}
            updateFailed={enriched.updateFailed}
            showBookmark={showBookmark}
            scaleBadges={scaleBadges}
            onPress={() => onPressManga(item as MangaGridItem)}
            onLongPress={onLongPressManga ? () => onLongPressManga(item as MangaGridItem) : undefined}
          />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xxxl,
  },
  emptyList: {
    flexGrow: 1,
  },
  row: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
});
