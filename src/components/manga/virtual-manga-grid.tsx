import { memo, useCallback, useMemo, useRef, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import {
  MangaGridCell,
  type MangaGridItem,
} from "@/components/manga/manga-grid";
import { VirtualRows } from "@/components/ui/virtual-rows";
import { Spacing } from "@/constants/theme";
import { useLibraryLookup } from "@/hooks/use-library-lookup";
import type { Manga } from "@/parsers/shared/types";

type GridRow = {
  key: string;
  items: MangaGridItem[];
};

type VirtualMangaGridProps = {
  entries: MangaGridItem[] | Manga[];
  pageId: string;
  onHeight: (pageId: string, height: number) => void;
  sourceId?: string;
  columns?: number;
  showBookmark?: boolean;
  showRating?: boolean;
  isRatingCompact?: boolean;
  scaleBadges?: boolean;
  onPressManga: (manga: MangaGridItem) => void;
  onLongPressManga?: (manga: MangaGridItem) => void;
  empty?: ReactNode;
  footer?: ReactNode;
};

type GridRowViewProps = {
  row: GridRow;
  width: number;
  sourceId?: string;
  getMeta: ReturnType<typeof useLibraryLookup>["getMeta"];
  showBookmark: boolean;
  showRating: boolean;
  isRatingCompact: boolean;
  scaleBadges: boolean;
  onPress: (manga: MangaGridItem) => void;
  onLongPress?: (manga: MangaGridItem) => void;
};

const GridRowView = memo(function GridRowView({
  row,
  width,
  sourceId,
  getMeta,
  showBookmark,
  showRating,
  isRatingCompact,
  scaleBadges,
  onPress,
  onLongPress,
}: GridRowViewProps) {
  return (
    <View style={styles.row}>
      {row.items.map((item) => (
        <MangaGridCell
          key={item.key}
          item={item}
          sourceId={sourceId}
          width={width}
          getMeta={getMeta}
          showBookmark={showBookmark}
          showRating={showRating}
          isRatingCompact={isRatingCompact}
          scaleBadges={scaleBadges}
          onPress={onPress}
          onLongPress={onLongPress}
        />
      ))}
    </View>
  );
});

const rowKey = (row: GridRow) => row.key;

export function VirtualMangaGrid({
  entries,
  pageId,
  onHeight,
  sourceId,
  columns = 3,
  showBookmark = true,
  showRating = false,
  isRatingCompact = true,
  scaleBadges = false,
  onPressManga,
  onLongPressManga,
  empty,
  footer,
}: VirtualMangaGridProps) {
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

  const rows = useMemo(() => {
    const list = entries as MangaGridItem[];
    const result: GridRow[] = [];
    for (let i = 0; i < list.length; i += columns) {
      const items = list.slice(i, i + columns);
      result.push({ key: `${i}:${items[0].key}`, items });
    }
    return result;
  }, [entries, columns]);

  const renderRow = useCallback(
    (row: GridRow) => (
      <GridRowView
        row={row}
        width={itemWidth}
        sourceId={sourceId}
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
      itemWidth,
      sourceId,
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

  const rowHeight = Math.round(itemWidth * 1.45) + 44;

  if (rows.length === 0) {
    return (
      <View
        collapsable={false}
        onLayout={(event) => onHeight(pageId, event.nativeEvent.layout.height)}
      >
        {empty}
      </View>
    );
  }

  return (
    <VirtualRows
      rows={rows}
      rowHeight={rowHeight}
      keyOf={rowKey}
      renderRow={renderRow}
      pageId={pageId}
      onHeight={onHeight}
      style={styles.list}
      footer={footer}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs + Spacing.md,
    paddingBottom: Spacing.xxxl,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
});
