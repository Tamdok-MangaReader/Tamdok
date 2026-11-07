import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { memo, useCallback, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  type RefreshControlProps,
  type ScrollViewProps,
} from "react-native";

import { uniqueByKey } from "@/utils/unique-entries";
import { useAdaptiveColumns, useWindowDimensions } from "@/hooks/use-duo-layout";
import { MangaActionsMenu } from "@/components/manga/manga-actions-menu";
import { MangaCover } from "@/components/manga/manga-cover";
import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { useTheme } from "@/hooks/use-theme";
import {
  useMangaDownloadFailures,
  useMangaDownloadProgress,
} from "@/services/download-progress";
import { useCoverRefreshIndicator } from "@/hooks/use-cover-refresh-indicator";
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
  /** Hides the title drawn over the cover. */
  hideTitle?: boolean;
  /** Library multi-select mode: draws a selection marker over the cover. */
  selecting?: boolean;
  selected?: boolean;
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
  listRef?: React.Ref<FlashListRef<MangaGridItem>>;
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
  onSelect?: (manga: MangaGridItem) => void;
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
  onSelect,
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

  const showRefreshIndicator = useCoverRefreshIndicator();
  const refreshing = useLibraryEntryRefreshing(
    item.inLibrary ? (sourceId ?? item.sourceId) : undefined,
    item.key,
  );

  const downloadProgress = useMangaDownloadProgress(
    sourceId ?? item.sourceId,
    item.key,
  );

  const downloadFailed = useMangaDownloadFailures(
    sourceId ?? item.sourceId,
    item.key,
  );

  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  const handleLongPress = useMemo(
    () => (onLongPress ? () => onLongPress(item) : undefined),
    [onLongPress, item],
  );

  // Selection mode keeps covers clean so the selection marker is the only overlay.
  const hideBadges = Boolean(item.selecting);

  const renderCover = (onCoverLongPress: () => void) => (
    <MangaCover
      sourceId={sourceId ?? item.sourceId}
      title={item.title}
      cover={item.cover}
      width={width}
      inLibrary={enriched.inLibrary}
      unreadCount={hideBadges ? 0 : enriched.unreadCount}
      downloadedCount={hideBadges ? 0 : enriched.downloadedCount}
      updateFailed={hideBadges ? false : enriched.updateFailed}
      finished={hideBadges ? false : enriched.finished}
      favorite={hideBadges ? false : enriched.favorite}
      refreshing={hideBadges || !showRefreshIndicator ? false : refreshing}
      downloadProgress={hideBadges ? undefined : downloadProgress}
      downloadFailed={hideBadges ? 0 : downloadFailed}
      showTitleOverlay={!(item as MangaGridItem).hideTitle}
      showBookmark={showBookmark}
      scaleBadges={scaleBadges}
      showStatus={!hideBadges && !!item.status}
      mangaStatus={item.status}
      rating={rating}
      isRatingCompact={isRatingCompact}
      onPress={handlePress}
      onLongPress={onCoverLongPress}
    />
  );

  const body = handleLongPress ? (
    renderCover(handleLongPress)
  ) : (
    <MangaActionsMenu
      sourceId={sourceId ?? item.sourceId}
      manga={item}
      renderCover={renderCover}
      onSelect={onSelect as never}
    />
  );

  if (!item.selecting) return body;

  return (
    <View>
      {body}
      <SelectionMarker
        selected={Boolean(item.selected)}
        height={Math.round(width * 1.45)}
      />
    </View>
  );
});

/** Dimming + check circle drawn over a cover while the library is in selection mode. */
export function SelectionMarker({
  selected,
  height,
}: {
  selected: boolean;
  height?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        selectionStyles.overlay,
        height ? { height } : selectionStyles.fill,
        selected && { backgroundColor: "rgba(0,0,0,0.35)" },
      ]}
    >
      <View
        style={[
          selectionStyles.circle,
          selected
            ? { backgroundColor: colors.tint, borderColor: colors.tint }
            : { borderColor: "#FFFFFF", backgroundColor: "rgba(0,0,0,0.25)" },
        ]}
      >
        {selected ? (
          <SFSymbolIcon
            name="checkmark"
            fallback="checkmark"
            size={14}
            color="#FFFFFF"
          />
        ) : null}
      </View>
    </View>
  );
}

const selectionStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderRadius: 10,
    padding: 6,
    alignItems: "flex-start",
  },
  fill: {
    bottom: 0,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});

const keyExtractor = (item: { key: string }) => item.key;

// New search results replace the data; start from the top instead of anchoring to the old first cell.
const MVCP_DISABLED = { disabled: true } as const;

const renderScrollComponent = (props: ScrollViewProps) => (
  <LiquidGlassScrollComponent {...props} />
);

export function MangaGrid({
  entries,
  sourceId,
  columns: baseColumns = 3,
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
  const columns = useAdaptiveColumns(baseColumns);
  const itemWidth = useMemo(
    () =>
      Math.floor(
        (width - Spacing.lg * 2 - Spacing.sm * (columns - 1)) / columns,
      ),
    [width, columns],
  );
  const { getMeta } = useLibraryLookup();
  const uniqueEntries = useMemo(
    () => uniqueByKey(entries as MangaGridItem[]),
    [entries],
  );

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

  // FlashList gives every column an equal slot (no columnWrapperStyle): shift each cover inside its slot
  // so the columns keep a Spacing.sm gap and the outer covers stay flush with the list padding.
  const columnStyles = useMemo(
    () =>
      Array.from({ length: columns }, (_, column) => ({
        paddingLeft: (column * Spacing.sm) / columns,
        // FlatList used row marginBottom (md) plus the content gap (xs) between rows.
        marginBottom: Spacing.md + Spacing.xs,
      })),
    [columns],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: MangaGridItem; index: number }) => (
      <View style={columnStyles[index % columns]}>
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
      </View>
    ),
    [
      columnStyles,
      columns,
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
    <FlashList
      ref={listRef}
      key={`manga-grid-${columns}`}
      style={styles.root}
      data={uniqueEntries}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      numColumns={columns}
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
      maintainVisibleContentPosition={MVCP_DISABLED}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  emptyList: { flexGrow: 1 },
});
