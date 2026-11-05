import * as Haptics from "expo-haptics";
import { memo, useCallback, useMemo, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  SelectionMarker,
  type MangaGridItem,
} from "@/components/manga/manga-grid";
import { MangaActionsMenu } from "@/components/manga/manga-actions-menu";
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
import { useCoverRefreshIndicator } from "@/hooks/use-cover-refresh-indicator";
import { useTheme } from "@/hooks/use-theme";
import { useLibraryEntryRefreshing } from "@/services/library-refresh-progress";

/** Grid item plus the extra fields list rows show. */
export type LibraryListItem = MangaGridItem & {
  sourceName?: string;
  statusLabel?: string;
  totalChapters?: number;
  lastReadAt?: number;
  summary?: string;
  downloadedTotal?: number;
  authors?: string[];
  tags?: string[];
  rating?: string;
};

const LIST_ROW_HEIGHT = 86;
const DESCRIPTIVE_ROW_HEIGHT = 140;
const LIST_COVER_WIDTH = 48;
const DESCRIPTIVE_COVER_WIDTH = 80;
const LONG_PRESS_DELAY = 340;
const ROW_RADIUS = 14;

type RowProps = {
  item: LibraryListItem;
  descriptive: boolean;
  getMeta: ReturnType<typeof useLibraryLookup>["getMeta"];
  onPress: (manga: MangaGridItem) => void;
  onLongPress?: (manga: MangaGridItem) => void;
  /** Starts multi-select from the actions menu. */
  onSelect?: (manga: MangaGridItem) => void;
};

const LibraryListRow = memo(function LibraryListRow({
  item,
  descriptive,
  getMeta,
  onPress,
  onLongPress,
  onSelect,
}: RowProps) {
  const { colors } = useTheme();
  const enriched = useMemo(
    () => enrichMangaWithLibraryMeta(item, item.sourceId, getMeta),
    [item, getMeta],
  );
  const coverWidth = descriptive ? DESCRIPTIVE_COVER_WIDTH : LIST_COVER_WIDTH;
  const handlePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(item);
  }, [onPress, item]);
  const handleLongPress = useMemo(
    () => (onLongPress ? () => onLongPress(item) : undefined),
    [onLongPress, item],
  );

  const showRefreshIndicator = useCoverRefreshIndicator();
  const refreshing = useLibraryEntryRefreshing(
    enriched.inLibrary ? item.sourceId : undefined,
    item.key,
  );
  const unread = enriched.unreadCount ?? 0;
  const total = item.totalChapters ?? 0;
  const chaptersLine =
    total > 0
      ? unread > 0
        ? `${t("library_list_chapters", {
            unread: String(unread),
            total: String(total),
          })} (${Math.min(100, Math.round((unread / total) * 100))}%)`
        : t("library_list_chapters_total", { total: String(total) })
      : unread > 0
        ? t("library_summary_unread", { count: String(unread) })
        : "";
  const downloaded = item.downloadedTotal ?? 0;
  const chaptersWithDownloads =
    descriptive && downloaded > 0
      ? [chaptersLine, t("library_list_downloaded", { count: String(downloaded) })]
          .filter(Boolean)
          .join(" · ")
      : chaptersLine;
  const meta = [item.sourceName, item.statusLabel, descriptive ? item.rating : undefined]
    .filter(Boolean)
    .join(" · ");
  const authors = descriptive ? (item.authors ?? []).slice(0, 3).join(", ") : "";
  const tags = descriptive ? (item.tags ?? []).slice(0, 5).join(" · ") : "";

  const renderContent = (onRowLongPress?: () => void) => (
    <Pressable
      onPress={handlePress}
      onLongPress={onRowLongPress}
      delayLongPress={LONG_PRESS_DELAY}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { height: descriptive ? DESCRIPTIVE_ROW_HEIGHT : LIST_ROW_HEIGHT },
        pressed && { backgroundColor: colors.secondaryFill },
      ]}
    >
      <View>
        <MangaCover
          sourceId={item.sourceId}
          title={item.title}
          cover={item.cover}
          width={coverWidth}
          inLibrary={enriched.inLibrary}
          // The unread count is already in the row text.
          unreadCount={0}
          downloadedCount={item.selecting ? 0 : enriched.downloadedCount}
          updateFailed={item.selecting ? false : enriched.updateFailed}
          finished={item.selecting ? false : enriched.finished}
          favorite={item.selecting ? false : enriched.favorite}
          refreshing={item.selecting || !showRefreshIndicator ? false : refreshing}
          showTitleOverlay={false}
          showBookmark={false}
          showStatus={false}
          onPress={handlePress}
          onLongPress={onRowLongPress}
        />
        {item.selecting ? (
          <SelectionMarker
            selected={Boolean(item.selected)}
            height={Math.round(coverWidth * 1.45)}
          />
        ) : null}
      </View>
      <View style={styles.text}>
        <ThemedText variant="headline" numberOfLines={1}>
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
        {authors ? (
          <ThemedText
            variant="footnote"
            color="secondaryLabel"
            numberOfLines={1}
          >
            {authors}
          </ThemedText>
        ) : null}
        {chaptersWithDownloads ? (
          <ThemedText
            variant="footnote"
            color={unread > 0 ? "tint" : "secondaryLabel"}
            numberOfLines={1}
          >
            {chaptersWithDownloads}
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
        {tags ? (
          <ThemedText variant="caption1" color="tertiaryLabel" numberOfLines={1}>
            {tags}
          </ThemedText>
        ) : null}
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.separator,
          { backgroundColor: colors.separator, left: coverWidth + Spacing.md + Spacing.sm },
        ]}
      />
    </Pressable>
  );

  // Selection mode long-presses directly; otherwise the lifted actions menu highlights the whole row.
  if (onLongPress) {
    return <View style={styles.paired}>{renderContent(handleLongPress)}</View>;
  }
  return (
    <MangaActionsMenu
      sourceId={item.sourceId}
      manga={item}
      renderCover={renderContent}
      onSelect={onSelect as never}
      style={styles.paired}
      lift={{ backgroundColor: colors.secondarySystemBackground, borderRadius: ROW_RADIUS }}
    />
  );
});

type LibraryListProps = {
  entries: LibraryListItem[];
  descriptive: boolean;
  pageId: string;
  onHeight: (pageId: string, height: number) => void;
  onPressManga: (manga: MangaGridItem) => void;
  onLongPressManga?: (manga: MangaGridItem) => void;
  /** Starts multi-select from the long-press actions menu. */
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
  const longPressRef = useRef(onLongPressManga);
  const selectRef = useRef(onSelectManga);
  pressRef.current = onPressManga;
  longPressRef.current = onLongPressManga;
  selectRef.current = onSelectManga;
  const handlePress = useCallback(
    (manga: MangaGridItem) => pressRef.current(manga),
    [],
  );
  const handleLongPress = useCallback(
    (manga: MangaGridItem) => longPressRef.current?.(manga),
    [],
  );
  const handleSelect = useCallback(
    (manga: MangaGridItem) => selectRef.current?.(manga),
    [],
  );
  const hasLongPress = !!onLongPressManga;

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
            getMeta={getMeta}
            onPress={handlePress}
            onLongPress={hasLongPress ? handleLongPress : undefined}
            onSelect={handleSelect}
          />
        ))}
      </View>
    ),
    [descriptive, perRow, getMeta, handlePress, handleLongPress, handleSelect, hasLongPress],
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
    paddingHorizontal: Spacing.lg - Spacing.sm,
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
    paddingHorizontal: Spacing.sm,
    borderRadius: ROW_RADIUS,
    borderCurve: "continuous",
  },
  text: {
    flex: 1,
    gap: 2,
    justifyContent: "center",
  },
  separator: {
    position: "absolute",
    right: Spacing.sm,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});
