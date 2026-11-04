import { memo, useCallback, useMemo, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  SelectionMarker,
  type MangaGridItem,
} from "@/components/manga/manga-grid";
import { MangaCover } from "@/components/manga/manga-cover";
import { ThemedText } from "@/components/ui/themed-text";
import { VirtualRows } from "@/components/ui/virtual-rows";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import {
  enrichMangaWithLibraryMeta,
  useLibraryLookup,
} from "@/hooks/use-library-lookup";
import { useIsOpenDuo } from "@/hooks/use-duo-layout";
import { useTheme } from "@/hooks/use-theme";

/** Grid item plus the extra fields list rows show. */
export type LibraryListItem = MangaGridItem & {
  sourceName?: string;
  statusLabel?: string;
  totalChapters?: number;
  lastReadAt?: number;
  summary?: string;
};

const LIST_ROW_HEIGHT = 86;
const DESCRIPTIVE_ROW_HEIGHT = 132;
const LIST_COVER_WIDTH = 48;
const DESCRIPTIVE_COVER_WIDTH = 80;
const LONG_PRESS_DELAY = 340;

type RowProps = {
  item: LibraryListItem;
  descriptive: boolean;
  getMeta: ReturnType<typeof useLibraryLookup>["getMeta"];
  onPress: (manga: MangaGridItem) => void;
  onLongPress?: (manga: MangaGridItem) => void;
  paired?: boolean;
};

const LibraryListRow = memo(function LibraryListRow({
  item,
  descriptive,
  paired,
  getMeta,
  onPress,
  onLongPress,
}: RowProps) {
  const { colors } = useTheme();
  const enriched = useMemo(
    () => enrichMangaWithLibraryMeta(item, item.sourceId, getMeta),
    [item, getMeta],
  );
  const coverWidth = descriptive ? DESCRIPTIVE_COVER_WIDTH : LIST_COVER_WIDTH;
  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  const handleLongPress = useMemo(
    () => (onLongPress ? () => onLongPress(item) : undefined),
    [onLongPress, item],
  );

  const unread = enriched.unreadCount ?? 0;
  const total = item.totalChapters ?? 0;
  const chaptersLine =
    total > 0
      ? unread > 0
        ? t("library_list_chapters", {
            unread: String(unread),
            total: String(total),
          })
        : t("library_list_chapters_total", { total: String(total) })
      : unread > 0
        ? t("library_summary_unread", { count: String(unread) })
        : "";
  const meta = [item.sourceName, item.statusLabel].filter(Boolean).join(" · ");

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={LONG_PRESS_DELAY}
      accessibilityRole="button"
      style={[
        styles.row,
        { height: descriptive ? DESCRIPTIVE_ROW_HEIGHT : LIST_ROW_HEIGHT },
        paired && styles.paired,
      ]}
    >
      <View>
        <MangaCover
          sourceId={item.sourceId}
          title={item.title}
          cover={item.cover}
          width={coverWidth}
          inLibrary={enriched.inLibrary}
          unreadCount={item.selecting ? 0 : enriched.unreadCount}
          downloadedCount={item.selecting ? 0 : enriched.downloadedCount}
          updateFailed={item.selecting ? false : enriched.updateFailed}
          finished={item.selecting ? false : enriched.finished}
          favorite={item.selecting ? false : enriched.favorite}
          showTitleOverlay={false}
          showBookmark={false}
          showStatus={false}
          onPress={handlePress}
          onLongPress={handleLongPress}
        />
        {item.selecting ? (
          <SelectionMarker
            selected={Boolean(item.selected)}
            height={Math.round(coverWidth * 1.45)}
          />
        ) : null}
      </View>
      <View style={styles.text}>
        <ThemedText variant="headline" numberOfLines={descriptive ? 2 : 1}>
          {item.title}
        </ThemedText>
        {meta ? (
          <ThemedText
            variant="footnote"
            color="secondaryLabel"
            numberOfLines={1}
          >
            {meta}
          </ThemedText>
        ) : null}
        {chaptersLine ? (
          <ThemedText
            variant="footnote"
            color={unread > 0 ? "tint" : "secondaryLabel"}
            numberOfLines={1}
          >
            {chaptersLine}
          </ThemedText>
        ) : null}
        {descriptive && item.lastReadAt ? (
          <ThemedText
            variant="caption1"
            color="tertiaryLabel"
            numberOfLines={1}
          >
            {t("library_list_last_read", {
              date: new Date(item.lastReadAt).toLocaleDateString(),
            })}
          </ThemedText>
        ) : null}
        {descriptive && item.summary ? (
          <ThemedText
            variant="footnote"
            color="secondaryLabel"
            numberOfLines={3}
          >
            {item.summary}
          </ThemedText>
        ) : null}
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.separator,
          { backgroundColor: colors.separator, left: coverWidth + Spacing.md },
        ]}
      />
    </Pressable>
  );
});

type LibraryListProps = {
  entries: LibraryListItem[];
  descriptive: boolean;
  pageId: string;
  onHeight: (pageId: string, height: number) => void;
  onPressManga: (manga: MangaGridItem) => void;
  onLongPressManga?: (manga: MangaGridItem) => void;
  /** Long press on a row (list has no context menu) starts selection. */
  onSelectManga?: (manga: MangaGridItem) => void;
  empty?: ReactNode;
};

type ListRowGroup = { id: string; items: LibraryListItem[] };

const rowKey = (group: ListRowGroup) => group.id;

/** Single-column library view (compact list or list with descriptions), virtualised like the grid. */
export function LibraryList({
  entries,
  descriptive,
  pageId,
  onHeight,
  onPressManga,
  onLongPressManga,
  onSelectManga,
  empty,
}: LibraryListProps) {
  const { getMeta } = useLibraryLookup();
  const pressRef = useRef(onPressManga);
  const longPressRef = useRef(onLongPressManga ?? onSelectManga);
  pressRef.current = onPressManga;
  longPressRef.current = onLongPressManga ?? onSelectManga;
  const handlePress = useCallback(
    (manga: MangaGridItem) => pressRef.current(manga),
    [],
  );
  const handleLongPress = useCallback(
    (manga: MangaGridItem) => longPressRef.current?.(manga),
    [],
  );
  const hasLongPress = !!(onLongPressManga ?? onSelectManga);

  // Unfolded Duo is wide enough for two columns of rows.
  const perRow = useIsOpenDuo() ? 2 : 1;
  const groups = useMemo<ListRowGroup[]>(() => {
    const out: ListRowGroup[] = [];
    for (let i = 0; i < entries.length; i += perRow) {
      const items = entries.slice(i, i + perRow);
      out.push({
        id: items.map((e) => `${e.sourceId}:${e.key}`).join("|"),
        items,
      });
    }
    return out;
  }, [entries, perRow]);

  const renderRow = useCallback(
    (group: ListRowGroup) => (
      <View style={styles.group}>
        {group.items.map((item) => (
          <LibraryListRow
            key={`${item.sourceId}:${item.key}`}
            item={item}
            descriptive={descriptive}
            paired={perRow > 1}
            getMeta={getMeta}
            onPress={handlePress}
            onLongPress={hasLongPress ? handleLongPress : undefined}
          />
        ))}
      </View>
    ),
    [descriptive, perRow, getMeta, handlePress, handleLongPress, hasLongPress],
  );

  if (entries.length === 0) {
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
      rows={groups}
      rowHeight={descriptive ? DESCRIPTIVE_ROW_HEIGHT : LIST_ROW_HEIGHT}
      keyOf={rowKey}
      renderRow={renderRow}
      pageId={pageId}
      onHeight={onHeight}
      style={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  group: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  paired: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  text: {
    flex: 1,
    gap: 2,
    justifyContent: "center",
  },
  separator: {
    position: "absolute",
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});
