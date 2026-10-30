import { memo, useCallback, useMemo, useRef } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  useWindowDimensions,
  type RefreshControlProps,
  type ScrollViewProps,
} from "react-native";

import { MangaCover } from "@/components/manga/manga-cover";
import { useLibraryEntryRefreshing } from "@/services/library-refresh-progress";
import { LiquidGlassScrollComponent } from "@/components/ui/liquid-glass-scroll-root";
import { Spacing } from "@/constants/theme";
import {
  useLibraryLookup,
  enrichMangaWithLibraryMeta,
} from "@/hooks/use-library-lookup";
import type { Manga } from "@/parsers/shared/types";
import {
  parseMangaDescription,
  parseRatingText,
} from "@/utils/manga-description";

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
  showRating?: boolean;
  isRatingCompact?: boolean;
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
  contentInsetAdjustmentBehavior?: "automatic" | "never";
  listRef?: React.Ref<FlatList<MangaGridItem>>;
};

type CellProps = {
  item: MangaGridItem;
  sourceId?: string;
  width: number;
  getMeta: ReturnType<typeof useLibraryLookup>["getMeta"];
  showBookmark: boolean;
  showRating: boolean;
  isRatingCompact: boolean;
  scaleBadges: boolean;
  onPress: (manga: MangaGridItem) => void;
  onLongPress?: (manga: MangaGridItem) => void;
};

export const MangaGridCell = memo(function MangaGridCell({
  item,
  sourceId,
  width,
  getMeta,
  showBookmark,
  showRating,
  isRatingCompact,
  scaleBadges,
  onPress,
  onLongPress,
}: CellProps) {
  const enriched = useMemo(
    () => enrichMangaWithLibraryMeta(item, sourceId ?? item.sourceId, getMeta),
    [item, sourceId, getMeta],
  );

  // Описание парсим ТОЛЬКО если рейтинг реально нужен и не пришёл готовым
  const rating = useMemo(() => {
    if (!showRating) return undefined;
    const raw =
      item.rating || parseMangaDescription(item.description).ratingLine;
    return parseRatingText(raw) ?? undefined;
  }, [showRating, item.rating, item.description]);

  const refreshing = useLibraryEntryRefreshing(
    item.inLibrary ? (sourceId ?? item.sourceId) : undefined,
    item.key,
  );

  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  const handleLongPress = useMemo(
    () => (onLongPress ? () => onLongPress(item) : undefined),
    [onLongPress, item],
  );

  return (
    <MangaCover
      title={item.title}
      cover={item.cover}
      width={width}
      inLibrary={enriched.inLibrary}
      unreadCount={enriched.unreadCount}
      downloadedCount={enriched.downloadedCount}
      updateFailed={enriched.updateFailed}
      refreshing={refreshing}
      showBookmark={showBookmark}
      scaleBadges={scaleBadges}
      showStatus={!!item.status}
      mangaStatus={item.status}
      rating={rating}
      isRatingCompact={isRatingCompact}
      onPress={handlePress}
      onLongPress={handleLongPress}
    />
  );
});

const keyExtractor = (item: { key: string }) => item.key;

const renderScrollComponent = (props: ScrollViewProps) => (
  <LiquidGlassScrollComponent {...props} />
);

export function MangaGrid({
  entries,
  sourceId,
  columns = 3,
  showBookmark = true,
  showRating = false,
  isRatingCompact = true,
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
  contentInsetAdjustmentBehavior = "automatic",
  listRef,
}: MangaGridProps) {
  const { width } = useWindowDimensions();
  const itemWidth = useMemo(
    () =>
      Math.floor(
        (width - Spacing.lg * 2 - Spacing.sm * (columns - 1)) / columns,
      ),
    [width, columns],
  );
  const { getMeta } = useLibraryLookup();

  const pressRef = useRef(onPressManga);
  const longPressRef = useRef(onLongPressManga);
  pressRef.current = onPressManga;
  longPressRef.current = onLongPressManga;

  const handlePress = useCallback(
    (m: MangaGridItem) => pressRef.current(m),
    [],
  );
  const handleLongPress = useCallback(
    (m: MangaGridItem) => longPressRef.current?.(m),
    [],
  );
  const hasLongPress = !!onLongPressManga;

  const renderItem = useCallback(
    ({ item }: { item: MangaGridItem }) => (
      <MangaGridCell
        item={item}
        sourceId={sourceId}
        width={itemWidth}
        getMeta={getMeta}
        showBookmark={showBookmark}
        showRating={showRating}
        isRatingCompact={isRatingCompact}
        scaleBadges={scaleBadges}
        onPress={handlePress}
        onLongPress={hasLongPress ? handleLongPress : undefined}
      />
    ),
    [
      sourceId,
      itemWidth,
      getMeta,
      showBookmark,
      showRating,
      isRatingCompact,
      scaleBadges,
      handlePress,
      handleLongPress,
      hasLongPress,
    ],
  );

  const contentContainerStyle = useMemo(
    () => [styles.list, entries.length === 0 ? styles.emptyList : null],
    [entries.length],
  );

  return (
    <FlatList
      ref={listRef}
      key={`manga-grid-${columns}`}
      style={styles.root}
      data={entries as MangaGridItem[]}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      numColumns={columns}
      columnWrapperStyle={columns > 1 ? styles.row : undefined}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
      scrollEnabled={scrollEnabled}
      bounces={scrollEnabled}
      renderScrollComponent={renderScrollComponent}
      onEndReached={onEndReached}
      onEndReachedThreshold={1.5}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent}
      refreshControl={refreshControl ?? undefined}
      extraData={extraData}
      initialNumToRender={columns * 4}
      maxToRenderPerBatch={columns * 2}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      removeClippedSubviews={Platform.OS === "android"}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
    paddingBottom: Spacing.xxxl,
  },
  emptyList: { flexGrow: 1 },
  row: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
});
