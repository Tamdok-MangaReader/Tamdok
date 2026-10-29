import { Image } from "expo-image";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ListRenderItemInfo,
  type PressableStateCallbackType,
  type ScrollViewProps,
} from "react-native";

import { HistoryOverflowMenu } from "@/components/history/history-overflow-menu";
import {
  SwipeableRow,
  SwipeableRowsProvider,
  type SwipeAction,
} from "@/components/sources/swipeable-row";
import { IncognitoModeBanner } from "@/components/settings/incognito-mode-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LiquidGlassScrollComponent } from "@/components/ui/liquid-glass-scroll-root";
import { ScreenContent } from "@/components/ui/screen-content";
import { ThemedText } from "@/components/ui/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import {
  chaptersOldestFirst,
  formatEntryChapterLabel,
} from "@/utils/chapter-label";
import {
  SourceCoverHeadersProvider,
  useSourceCoverHeaders,
  useSourceCoverHeadersReady,
} from "@/context/source-cover-context";
import { useSources } from "@/context/sources-context";
import { useMangaDataRefresh } from "@/hooks/use-manga-data";
import { useTheme } from "@/hooks/use-theme";
import type { Chapter } from "@/parsers/shared/types";
import { getLibraryEntries } from "@/services/library";
import {
  getHistoryEntries,
  removeChapterFromHistory,
  removeHistorySince,
  removeMangaHistoryGroup,
  type HistoryEntry,
} from "@/services/manga-tracking";
import { peekMangaDetailCache } from "@/services/manga-detail-cache";
import { findInstalledSource, sourceRouteId } from "@/services/sources";
import { coverImageSource } from "@/utils/cover-image-source";
import { IMAGE_CACHE_POLICY } from "@/utils/image-memory";
import { mangaHref, readerHref } from "@/utils/manga-route";

const VISIBLE_CHAPTER_LIMIT = 5;
const RELOAD_DEBOUNCE_MS = 100;
const PRESSED_STYLE = { opacity: 0.72 } as const;

type InstalledSourceLike = ReturnType<typeof findInstalledSource>;

type MangaHistoryGroup = {
  key: string;
  sourceId: string;
  mangaKey: string;
  mangaTitle: string;
  cover?: string;
  chapters: HistoryEntry[];
  timeRange: string;
};

type HistoryRow =
  | { kind: "header"; id: string; title: string; isFirst: boolean }
  | { kind: "group"; id: string; group: MangaHistoryGroup };

let timeFormat: Intl.DateTimeFormat | null = null;
let dateFormat: Intl.DateTimeFormat | null = null;

function formatHistoryTime(timestamp: number): string {
  timeFormat ??= new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return timeFormat.format(timestamp);
}

function formatFullDate(timestamp: number): string {
  dateFormat ??= new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return dateFormat.format(timestamp);
}

function startOfLocalDay(daysAgo = 0): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (daysAgo) date.setDate(date.getDate() - daysAgo);
  return date.getTime();
}

function makeDateLabeler(): (timestamp: number) => string {
  const today = startOfLocalDay(0);
  const yesterday = startOfLocalDay(1);
  const cache = new Map<number, string>();

  return (timestamp) => {
    const day = new Date(timestamp);
    day.setHours(0, 0, 0, 0);
    const dayStart = day.getTime();
    let label = cache.get(dayStart);
    if (label === undefined) {
      if (dayStart === today) label = t("history_today");
      else if (dayStart === yesterday) label = t("history_yesterday");
      else label = formatFullDate(timestamp);
      cache.set(dayStart, label);
    }
    return label;
  };
}

function sourceKindLabel(kind: string): string {
  return kind.toUpperCase();
}

type ChapterLookup = Map<string, { chapter: Chapter; ordinal: number }>;
const chapterLookupCache = new WeakMap<Chapter[], ChapterLookup>();

function lookupFor(chapters: Chapter[]): ChapterLookup {
  let lookup = chapterLookupCache.get(chapters);
  if (!lookup) {
    const created: ChapterLookup = new Map();
    chaptersOldestFirst(chapters).forEach((chapter, index) => {
      created.set(chapter.key, { chapter, ordinal: index + 1 });
    });
    chapterLookupCache.set(chapters, created);
    lookup = created;
  }
  return lookup;
}

function formatHistoryChapterLabel(entry: HistoryEntry): string {
  const chapters = peekMangaDetailCache(entry.sourceId, entry.mangaKey)?.manga
    .chapters;
  const found =
    chapters && chapters.length > 0
      ? lookupFor(chapters).get(entry.chapterKey)
      : undefined;
  return formatEntryChapterLabel(
    found?.chapter,
    entry.chapterTitle,
    entry.chapterKey,
    found?.ordinal,
  );
}

function shallowEqual(a: object, b: object): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (
      (a as Record<string, unknown>)[key] !==
      (b as Record<string, unknown>)[key]
    )
      return false;
  }
  return true;
}

function entryKey(entry: HistoryEntry): string {
  return `${entry.sourceId}:${entry.mangaKey}:${entry.chapterKey}:${entry.dateRead}`;
}

function sameGroup(a: MangaHistoryGroup, b: MangaHistoryGroup): boolean {
  if (
    a.mangaTitle !== b.mangaTitle ||
    a.cover !== b.cover ||
    a.timeRange !== b.timeRange ||
    a.chapters.length !== b.chapters.length
  ) {
    return false;
  }
  for (let i = 0; i < a.chapters.length; i += 1) {
    if (a.chapters[i] !== b.chapters[i]) return false;
  }
  return true;
}

function buildRows(
  entries: HistoryEntry[],
  previous: Map<string, MangaHistoryGroup>,
): { rows: HistoryRow[]; groups: Map<string, MangaHistoryGroup> } {
  const label = makeDateLabeler();
  const byDate = new Map<string, HistoryEntry[]>();

  for (const entry of entries) {
    const title = label(entry.dateRead);
    const bucket = byDate.get(title);
    if (bucket) bucket.push(entry);
    else byDate.set(title, [entry]);
  }

  const rows: HistoryRow[] = [];
  const groupsById = new Map<string, MangaHistoryGroup>();
  let isFirst = true;

  for (const [title, dateEntries] of byDate) {
    rows.push({ kind: "header", id: `header:${title}`, title, isFirst });
    isFirst = false;

    const byManga = new Map<string, HistoryEntry[]>();
    for (const entry of dateEntries) {
      const key = `${entry.sourceId}:${entry.mangaKey}`;
      const bucket = byManga.get(key);
      if (bucket) bucket.push(entry);
      else byManga.set(key, [entry]);
    }

    const groups: MangaHistoryGroup[] = [];
    for (const [key, chapters] of byManga) {
      chapters.sort((a, b) => b.dateRead - a.dateRead);
      const newest = chapters[0]!;
      const oldest = chapters[chapters.length - 1]!;
      const from = formatHistoryTime(oldest.dateRead);
      const to = formatHistoryTime(newest.dateRead);

      const candidate: MangaHistoryGroup = {
        key,
        sourceId: newest.sourceId,
        mangaKey: newest.mangaKey,
        mangaTitle: newest.mangaTitle,
        cover: newest.cover,
        chapters,
        timeRange: from === to ? from : `${from} – ${to}`,
      };

      const id = `${title}:${key}`;
      const old = previous.get(id);
      const group = old && sameGroup(old, candidate) ? old : candidate;
      groupsById.set(id, group);
      groups.push(group);
    }

    groups.sort((a, b) => b.chapters[0]!.dateRead - a.chapters[0]!.dateRead);
    for (const group of groups) {
      rows.push({ kind: "group", id: `${title}:${group.key}`, group });
    }
  }

  return { rows, groups: groupsById };
}

const mangaRowStyle = ({ pressed }: PressableStateCallbackType) => [
  styles.mangaRow,
  pressed && PRESSED_STYLE,
];

const chapterRowStyle = ({ pressed }: PressableStateCallbackType) => [
  styles.chapterRow,
  pressed && PRESSED_STYLE,
];

const renderScrollComponent = (props: ScrollViewProps) => (
  <LiquidGlassScrollComponent {...props} />
);

const LIST_HEADER = <IncognitoModeBanner />;

const HistoryHeaderRow = memo(function HistoryHeaderRow({
  title,
  isFirst,
}: {
  title: string;
  isFirst: boolean;
}) {
  return (
    <ThemedText
      variant="headline"
      style={[
        styles.sectionTitle,
        isFirst ? styles.sectionTitleFirst : styles.sectionTitleNext,
      ]}
    >
      {title}
    </ThemedText>
  );
});

const HistoryChapterRow = memo(function HistoryChapterRow({
  entry,
  rowId,
  onOpen,
  onDelete,
}: {
  entry: HistoryEntry;
  rowId: string;
  onOpen: (entry: HistoryEntry) => void;
  onDelete: (entry: HistoryEntry) => void;
}) {
  const { colors } = useTheme();

  const label = useMemo(() => formatHistoryChapterLabel(entry), [entry]);
  const time = useMemo(
    () => formatHistoryTime(entry.dateRead),
    [entry.dateRead],
  );
  const pageLabel = useMemo(
    () =>
      entry.page != null && entry.page >= 0
        ? t("history_on_page", { page: String(entry.page + 1) })
        : null,
    [entry.page],
  );

  const actions = useMemo<SwipeAction[]>(
    () => [
      {
        key: "delete",
        label: t("history_delete_chapter"),
        icon: "trash-outline",
        sfSymbol: "trash",
        color: colors.destructive,
        onPress: () => onDelete(entry),
      },
    ],
    [colors.destructive, entry, onDelete],
  );

  const handlePress = useCallback(() => onOpen(entry), [onOpen, entry]);

  return (
    <SwipeableRow rowId={rowId} actions={actions} fullSwipeActionKey="delete">
      <Pressable style={chapterRowStyle} onPress={handlePress}>
        <ThemedText
          variant="subheadline"
          numberOfLines={2}
          style={styles.chapterTitle}
        >
          {label}
        </ThemedText>
        <View style={styles.chapterMeta}>
          {pageLabel ? (
            <ThemedText variant="caption1" color="secondaryLabel">
              {pageLabel}
            </ThemedText>
          ) : null}
          <ThemedText variant="caption1" color="tertiaryLabel">
            {time}
          </ThemedText>
        </View>
      </Pressable>
    </SwipeableRow>
  );
});

const HistoryMangaGroup = memo(function HistoryMangaGroup({
  group,
  source,
  onOpenManga,
  onChanged,
}: {
  group: MangaHistoryGroup;
  source: InstalledSourceLike;
  onOpenManga: (group: MangaHistoryGroup) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const coverHeaders = useSourceCoverHeaders();
  const coverHeadersReady = useSourceCoverHeadersReady();
  const [expanded, setExpanded] = useState(false);

  const hiddenCount = Math.max(
    0,
    group.chapters.length - VISIBLE_CHAPTER_LIMIT,
  );
  const visibleChapters = useMemo(
    () =>
      expanded || hiddenCount === 0
        ? group.chapters
        : group.chapters.slice(0, VISIBLE_CHAPTER_LIMIT),
    [expanded, hiddenCount, group.chapters],
  );

  const sourceLabel = source
    ? `${source.manifest.info.name} · ${sourceKindLabel(source.kind)}`
    : group.sourceId;

  const coverSource = useMemo(
    () =>
      group.cover && coverHeadersReady
        ? coverImageSource(group.cover, coverHeaders)
        : undefined,
    [group.cover, coverHeaders, coverHeadersReady],
  );

  const openChapter = useCallback(
    (entry: HistoryEntry) => {
      if (!source) return;
      const page =
        entry.page != null && entry.page >= 0 ? entry.page : undefined;
      router.navigate(
        readerHref(
          sourceRouteId(source),
          entry.mangaKey,
          entry.chapterKey,
          entry.chapterTitle ?? entry.chapterKey,
          entry.mangaTitle,
          page,
          entry.cover,
        ),
      );
    },
    [router, source],
  );

  const deleteChapter = useCallback(
    (entry: HistoryEntry) => {
      void removeChapterFromHistory(
        entry.sourceId,
        entry.mangaKey,
        entry.chapterKey,
      ).then(onChanged);
    },
    [onChanged],
  );

  const deleteMangaActions = useMemo<SwipeAction[]>(
    () => [
      {
        key: "delete",
        label: t("history_delete_manga"),
        icon: "trash-outline",
        sfSymbol: "trash",
        color: colors.destructive,
        onPress: () => {
          void removeMangaHistoryGroup(
            group.sourceId,
            group.mangaKey,
            group.chapters.map((chapter) => chapter.chapterKey),
          ).then(onChanged);
        },
      },
    ],
    [colors.destructive, group, onChanged],
  );

  const handleOpenManga = useCallback(
    () => onOpenManga(group),
    [onOpenManga, group],
  );
  const handleShowMore = useCallback(() => setExpanded(true), []);

  const coverBoxStyle = useMemo(
    () => [
      styles.cover,
      { borderRadius: radius.sm, backgroundColor: colors.secondaryFill },
    ],
    [radius.sm, colors.secondaryFill],
  );
  const chapterListStyle = useMemo(
    () => [styles.chapterList, { borderLeftColor: colors.separator }],
    [colors.separator],
  );

  return (
    <View style={styles.mangaGroup}>
      <SwipeableRow
        rowId={`${group.key}:manga`}
        actions={deleteMangaActions}
        fullSwipeActionKey="delete"
      >
        <Pressable style={mangaRowStyle} onPress={handleOpenManga}>
          <View style={coverBoxStyle}>
            {coverSource ? (
              <Image
                source={coverSource}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy={IMAGE_CACHE_POLICY}
                allowDownscaling
              />
            ) : (
              <ThemedText variant="title3" color="tertiaryLabel">
                {group.mangaTitle.slice(0, 1)}
              </ThemedText>
            )}
          </View>
          <View style={styles.mangaMeta}>
            <ThemedText variant="body" numberOfLines={2}>
              {group.mangaTitle}
            </ThemedText>
            <ThemedText
              variant="footnote"
              color="secondaryLabel"
              numberOfLines={1}
            >
              {sourceLabel}
            </ThemedText>
            {group.timeRange ? (
              <ThemedText variant="caption1" color="tertiaryLabel">
                {group.timeRange}
              </ThemedText>
            ) : null}
          </View>
        </Pressable>
      </SwipeableRow>

      {group.chapters.length > 0 ? (
        <View style={chapterListStyle}>
          {visibleChapters.map((chapter) => (
            <HistoryChapterRow
              key={`${chapter.chapterKey}:${chapter.dateRead}`}
              entry={chapter}
              rowId={`${group.key}:${chapter.chapterKey}:${chapter.dateRead}`}
              onOpen={openChapter}
              onDelete={deleteChapter}
            />
          ))}

          {hiddenCount > 0 && !expanded ? (
            <Pressable
              style={styles.showMoreButton}
              onPress={handleShowMore}
              accessibilityRole="button"
            >
              <ThemedText variant="subheadline" color="tint">
                {t("history_show_more", { count: String(hiddenCount) })}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const HistoryGroupRow = memo(function HistoryGroupRow({
  group,
  installed,
  onOpenManga,
  onChanged,
}: {
  group: MangaHistoryGroup;
  installed: ReturnType<typeof useSources>["installed"];
  onOpenManga: (group: MangaHistoryGroup) => void;
  onChanged: () => void;
}) {
  const source = useMemo(
    () => findInstalledSource(installed, group.sourceId),
    [installed, group.sourceId],
  );

  return (
    <View style={styles.groupRow}>
      <SourceCoverHeadersProvider source={source}>
        <HistoryMangaGroup
          group={group}
          source={source}
          onOpenManga={onOpenManga}
          onChanged={onChanged}
        />
      </SourceCoverHeadersProvider>
    </View>
  );
});

export default function HistoryScreen() {
  const router = useRouter();
  const { installed } = useSources();
  const refreshTick = useMangaDataRefresh();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const entriesRef = useRef<HistoryEntry[]>([]);
  const groupCacheRef = useRef<Map<string, MangaHistoryGroup>>(new Map());
  const installedRef = useRef(installed);
  installedRef.current = installed;

  const focusedRef = useRef(false);
  const dirtyRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadHistory = useCallback(async () => {
    const [history, libraryEntries] = await Promise.all([
      getHistoryEntries(),
      getLibraryEntries(),
    ]);
    const libraryMeta = new Map(
      libraryEntries.map(
        (entry) => [`${entry.sourceId}:${entry.mangaKey}`, entry] as const,
      ),
    );

    const next = history.map((entry) => {
      const libraryEntry = libraryMeta.get(
        `${entry.sourceId}:${entry.mangaKey}`,
      );
      const cached = peekMangaDetailCache(
        entry.sourceId,
        entry.mangaKey,
      )?.manga;
      return {
        ...entry,
        mangaTitle:
          entry.mangaTitle && entry.mangaTitle !== entry.mangaKey
            ? entry.mangaTitle
            : (libraryEntry?.title ?? cached?.title ?? entry.mangaTitle),
        cover: entry.cover ?? libraryEntry?.cover ?? cached?.cover,
      };
    });

    const previous = entriesRef.current;
    const previousByKey = new Map(
      previous.map((entry) => [entryKey(entry), entry] as const),
    );
    const merged = next.map((entry) => {
      const old = previousByKey.get(entryKey(entry));
      return old && shallowEqual(old, entry) ? old : entry;
    });

    const unchanged =
      merged.length === previous.length &&
      merged.every((entry, index) => entry === previous[index]);
    if (unchanged) return;

    entriesRef.current = merged;
    setEntries(merged);
  }, []);

  const scheduleLoad = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      dirtyRef.current = false;
      void loadHistory();
    }, RELOAD_DEBOUNCE_MS);
  }, [loadHistory]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (dirtyRef.current) scheduleLoad();
      return () => {
        focusedRef.current = false;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };
    }, [scheduleLoad]),
  );

  useEffect(() => {
    dirtyRef.current = true;
    if (focusedRef.current) scheduleLoad();
  }, [refreshTick, scheduleLoad]);

  const requestReload = useCallback(() => {
    dirtyRef.current = true;
    scheduleLoad();
  }, [scheduleLoad]);

  const rows = useMemo(() => {
    const result = buildRows(entries, groupCacheRef.current);
    groupCacheRef.current = result.groups;
    return result.rows;
  }, [entries]);

  const openManga = useCallback(
    (group: MangaHistoryGroup) => {
      const source = findInstalledSource(installedRef.current, group.sourceId);
      if (!source) return;
      router.navigate(
        mangaHref(sourceRouteId(source), {
          key: group.mangaKey,
          title: group.mangaTitle,
          cover: group.cover,
        }),
      );
    },
    [router],
  );

  const confirmClear = useCallback(
    (title: string, message: string, cutoffMs: number) => {
      Alert.alert(title, message, [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("history_clear_action"),
          style: "destructive",
          onPress: () => {
            void removeHistorySince(cutoffMs).then(requestReload);
          },
        },
      ]);
    },
    [requestReload],
  );

  const hasEntries = entries.length > 0;

  const renderHeaderRight = useCallback(
    () =>
      hasEntries ? (
        <HistoryOverflowMenu
          onClearToday={() =>
            confirmClear(
              t("history_clear_today"),
              t("history_clear_today_confirm"),
              startOfLocalDay(),
            )
          }
          onClearWeek={() =>
            confirmClear(
              t("history_clear_week"),
              t("history_clear_week_confirm"),
              startOfLocalDay(6),
            )
          }
          onClearAll={() =>
            confirmClear(
              t("history_clear_all"),
              t("history_clear_all_confirm"),
              0,
            )
          }
        />
      ) : null,
    [hasEntries, confirmClear],
  );

  const screenOptions = useMemo(
    () => ({ headerRight: renderHeaderRight }),
    [renderHeaderRight],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<HistoryRow>) => {
      if (item.kind === "header") {
        return <HistoryHeaderRow title={item.title} isFirst={item.isFirst} />;
      }
      return (
        <HistoryGroupRow
          group={item.group}
          installed={installed}
          onOpenManga={openManga}
          onChanged={requestReload}
        />
      );
    },
    [installed, openManga, requestReload],
  );

  if (!hasEntries) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <Stack.Title>{t("history")}</Stack.Title>
        <ScreenContent centerContent>
          <View style={styles.emptyWrap}>
            <IncognitoModeBanner />
            <EmptyState
              icon="time-outline"
              title={t("history_empty_title")}
              description={t("history_empty_desc")}
            />
          </View>
        </ScreenContent>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <Stack.Title>{t("history")}</Stack.Title>
      <SwipeableRowsProvider>
        <FlatList
          style={styles.root}
          data={rows}
          keyExtractor={rowKeyExtractor}
          renderItem={renderItem}
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustsScrollIndicatorInsets
          contentContainerStyle={styles.list}
          ListHeaderComponent={LIST_HEADER}
          renderScrollComponent={renderScrollComponent}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews={Platform.OS === "android"}
        />
      </SwipeableRowsProvider>
    </>
  );
}

function rowKeyExtractor(row: HistoryRow): string {
  return row.id;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    flexGrow: 1,
    padding: Spacing.lg,
    paddingBottom: BottomTabInset + Spacing.lg,
  },
  sectionTitle: {
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.md,
  },
  sectionTitleFirst: {
    marginTop: Spacing.xl,
  },
  sectionTitleNext: {
    marginTop: Spacing.xl - Spacing.md,
  },
  groupRow: {
    marginBottom: Spacing.md,
  },
  emptyWrap: {
    width: "100%",
    alignItems: "stretch",
  },
  mangaGroup: {
    gap: Spacing.xs,
  },
  mangaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  cover: {
    width: 48,
    height: 68,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  mangaMeta: {
    flex: 1,
    gap: 2,
  },
  chapterList: {
    marginLeft: 24,
    paddingLeft: Spacing.md,
    borderLeftWidth: StyleSheet.hairlineWidth * 2,
    gap: Spacing.xs,
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  chapterTitle: {
    flex: 1,
  },
  chapterMeta: {
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 0,
  },
  showMoreButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
});
