import { Ionicons } from "@expo/vector-icons";
import { useIllustrationMode } from "@/services/illustration-mode";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import Animated, { useSharedValue } from "react-native-reanimated";
import PagerView from "react-native-pager-view";
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

import {
  LibraryCategoryTabs,
  type LibraryCategoryTab,
} from "@/components/library/library-category-tabs";
import { HistoryOverflowMenu } from "@/components/history/history-overflow-menu";
import {
  SwipeableRow,
  SwipeableRowsProvider,
  type SwipeAction,
} from "@/components/sources/swipeable-row";
import { IncognitoModeBanner } from "@/components/settings/incognito-mode-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { MeasuredPage } from "@/components/ui/measured-page";
import {
  LiftedActionMenu,
  type LiftedMenuItem,
} from "@/components/ui/lifted-action-menu";
import { VirtualRows } from "@/components/ui/virtual-rows";
import { usePagerHeights } from "@/hooks/use-pager-heights";
import { usePinnedTabs } from "@/components/library/pinned-tabs";
import { HistorySkeleton } from "@/components/ui/skeleton";
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
import { usePageScrollHandler } from "@/hooks/use-page-scroll-handler";
import { useMangaDataRefresh } from "@/hooks/use-manga-data";
import { useTheme } from "@/hooks/use-theme";
import type { Chapter } from "@/parsers/shared/types";
import { getAppSettings } from "@/services/app-settings";
import { getLibraryEntries } from "@/services/library";
import { subscribeAppSettings } from "@/utils/app-settings-events";
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
import { useStoredCoverHeaders } from "@/utils/cover-headers-store";
import { IMAGE_CACHE_POLICY } from "@/utils/image-memory";
import { mangaHref, readerHref } from "@/utils/manga-route";

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

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
  | {
      kind: "header";
      id: string;
      title: string;
      isFirst: boolean;
      count: number;
      groups: MangaHistoryGroup[];
    }
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
    const headerRow: Extract<HistoryRow, { kind: "header" }> = {
      kind: "header",
      id: `header:${title}`,
      title,
      isFirst,
      count: 0,
      groups: [],
    };
    rows.push(headerRow);
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

    headerRow.count = groups.length;
    headerRow.groups = groups;
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

function confirmDelete(message: string, onConfirm: () => void) {
  Alert.alert(t("history_delete_confirm_title"), message, [
    { text: t("cancel"), style: "cancel" },
    { text: t("history_clear_action"), style: "destructive", onPress: onConfirm },
  ]);
}

const HistoryHeaderRow = memo(function HistoryHeaderRow({
  title,
  count,
  isFirst,
  groups,
  onChanged,
}: {
  title: string;
  count: number;
  isFirst: boolean;
  groups: MangaHistoryGroup[];
  onChanged: () => void;
}) {
  const { colors } = useTheme();

  const menuItems = useMemo<LiftedMenuItem[]>(
    () => [
      {
        key: "delete",
        label: t("history_delete_day"),
        sfSymbol: "trash",
        fallback: "trash-outline",
        destructive: true,
        onPress: () =>
          confirmDelete(t("history_delete_day_confirm", { title }), () => {
            void (async () => {
              for (const group of groups) {
                await removeMangaHistoryGroup(
                  group.sourceId,
                  group.mangaKey,
                  group.chapters.map((chapter) => chapter.chapterKey),
                );
              }
              onChanged();
            })();
          }),
      },
    ],
    [groups, title, onChanged],
  );

  return (
    <LiftedActionMenu
      items={menuItems}
      liftScale={1.02}
      renderContent={(onLongPress) => (
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={340}
          style={[
            styles.sectionHeader,
            isFirst ? styles.sectionTitleFirst : styles.sectionTitleNext,
          ]}
        >
          <ThemedText variant="title3" style={styles.sectionTitle}>
            {title}
          </ThemedText>
          <View
            style={[styles.countBadge, { backgroundColor: colors.tertiaryFill }]}
          >
            <ThemedText variant="caption1" color="secondaryLabel">
              {count}
            </ThemedText>
          </View>
        </Pressable>
      )}
    />
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
        onPress: () =>
          confirmDelete(t("history_delete_chapter_confirm"), () =>
            onDelete(entry),
          ),
      },
    ],
    [colors.destructive, entry, onDelete],
  );

  const handlePress = useCallback(() => onOpen(entry), [onOpen, entry]);

  return (
    <SwipeableRow rowId={rowId} actions={actions} fullSwipeActionKey="delete">
      <Pressable style={chapterRowStyle} onPress={handlePress}>
        <Ionicons
          name="bookmark-outline"
          size={15}
          color={colors.tertiaryLabel}
        />
        <ThemedText
          variant="subheadline"
          numberOfLines={2}
          style={styles.chapterTitle}
        >
          {label}
        </ThemedText>
        <View style={styles.chapterMeta}>
          {pageLabel ? (
            <View
              style={[
                styles.pageChip,
                { backgroundColor: colors.tertiaryFill },
              ]}
            >
              <ThemedText variant="caption2" color="secondaryLabel">
                {pageLabel}
              </ThemedText>
            </View>
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
  const illustration = useIllustrationMode();
  const { colors, radius } = useTheme();
  const contextCoverHeaders = useSourceCoverHeaders();
  const storedCoverHeaders = useStoredCoverHeaders(
    source?.id ?? group.sourceId,
  );
  const coverHeaders = contextCoverHeaders ?? storedCoverHeaders;
  const [coverRetry, setCoverRetry] = useState(0);
  const coverRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(
    () => () => {
      if (coverRetryTimerRef.current) clearTimeout(coverRetryTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    setCoverRetry(0);
  }, [group.cover]);

  const handleCoverError = useCallback(() => {
    if (coverRetryTimerRef.current) return;
    coverRetryTimerRef.current = setTimeout(() => {
      coverRetryTimerRef.current = null;
      setCoverRetry((value) => (value < 3 ? value + 1 : value));
    }, 2500 * (coverRetry + 1));
  }, [coverRetry]);

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

  const sourceLabel = illustration
    ? "Komga"
    : source
      ? `${source.manifest.info.name} · ${sourceKindLabel(source.kind)}`
      : group.sourceId;

  const coverSource = useMemo(
    () =>
      group.cover ? coverImageSource(group.cover, coverHeaders) : undefined,
    [group.cover, coverHeaders],
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
        onPress: () =>
          confirmDelete(t("history_delete_manga_confirm"), () => {
            void removeMangaHistoryGroup(
              group.sourceId,
              group.mangaKey,
              group.chapters.map((chapter) => chapter.chapterKey),
            ).then(onChanged);
          }),
      },
    ],
    [colors.destructive, group, onChanged],
  );

  const handleOpenManga = useCallback(
    () => onOpenManga(group),
    [onOpenManga, group],
  );
  const handleToggleOpen = useCallback(() => setOpen((value) => !value), []);

  const menuItems = useMemo<LiftedMenuItem[]>(() => {
    const items: LiftedMenuItem[] = [
      {
        key: "manga",
        label: t("history_menu_open_manga"),
        sfSymbol: "book",
        fallback: "book-outline",
        onPress: () => onOpenManga(group),
      },
    ];
    if (source) {
      items.push({
        key: "source",
        label: t("history_menu_open_source"),
        sfSymbol: "globe",
        fallback: "globe-outline",
        onPress: () =>
          router.navigate(
            `/sources/${encodeURIComponent(sourceRouteId(source))}`,
          ),
      });
    }
    items.push({
      key: "delete",
      label: t("history_delete_manga"),
      sfSymbol: "trash",
      fallback: "trash-outline",
      destructive: true,
      onPress: () =>
        confirmDelete(t("history_delete_manga_confirm"), () => {
          void removeMangaHistoryGroup(
            group.sourceId,
            group.mangaKey,
            group.chapters.map((chapter) => chapter.chapterKey),
          ).then(onChanged);
        }),
    });
    return items;
  }, [group, source, router, onOpenManga, onChanged]);
  const handleShowMore = useCallback(() => setExpanded(true), []);
  const handleShowLess = useCallback(() => setExpanded(false), []);

  const coverBoxStyle = useMemo(
    () => [
      styles.cover,
      { borderRadius: radius.sm, backgroundColor: colors.secondaryFill },
    ],
    [radius.sm, colors.secondaryFill],
  );
  const chapterListStyle = useMemo(
    () => [styles.chapterList, { borderTopColor: colors.separator }],
    [colors.separator],
  );

  return (
    <View
      style={[
        styles.mangaGroup,
        {
          backgroundColor: colors.secondarySystemBackground,
          borderRadius: radius.md,
        },
      ]}
    >
      <SwipeableRow
        rowId={`${group.key}:manga`}
        actions={deleteMangaActions}
        fullSwipeActionKey="delete"
      >
        <LiftedActionMenu
          items={menuItems}
          renderContent={(onLongPress) => (
            <View
              style={{
                backgroundColor: colors.secondarySystemBackground,
                borderRadius: radius.md,
              }}
            >
              <Pressable
                style={mangaRowStyle}
                onPress={handleToggleOpen}
                onLongPress={onLongPress}
                delayLongPress={340}
              >
          <View style={coverBoxStyle}>
            {coverSource ? (
              <Image
                key={coverRetry}
                source={coverSource}
                recyclingKey={group.cover}
                onError={coverRetry < 3 ? handleCoverError : undefined}
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
            <ThemedText variant="headline" numberOfLines={2}>
              {group.mangaTitle}
            </ThemedText>
            <View style={styles.metaLine}>
              <View
                style={[
                  styles.sourceChip,
                  { backgroundColor: colors.tertiaryFill },
                ]}
              >
                <ThemedText
                  variant="caption1"
                  color="secondaryLabel"
                  numberOfLines={1}
                >
                  {sourceLabel}
                </ThemedText>
              </View>
            </View>
            {group.timeRange ? (
              <View style={styles.metaLine}>
                <Ionicons
                  name="time-outline"
                  size={13}
                  color={colors.tertiaryLabel}
                />
                <ThemedText variant="caption1" color="tertiaryLabel">
                  {group.timeRange}
                </ThemedText>
              </View>
            ) : null}
          </View>
          <Ionicons
            name={open ? "chevron-down" : "chevron-forward"}
            size={16}
            color={colors.tertiaryLabel}
          />
              </Pressable>
            </View>
          )}
        />
      </SwipeableRow>

      {open && group.chapters.length > 0 ? (
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
              <Ionicons name="chevron-down" size={14} color={colors.tint} />
            </Pressable>
          ) : null}

          {hiddenCount > 0 && expanded ? (
            <Pressable
              style={styles.showMoreButton}
              onPress={handleShowLess}
              accessibilityRole="button"
            >
              <ThemedText variant="subheadline" color="tint">
                {t("manga_show_less")}
              </ThemedText>
              <Ionicons name="chevron-up" size={14} color={colors.tint} />
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
  const [loaded, setLoaded] = useState(false);

  const entriesRef = useRef<HistoryEntry[]>([]);
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

    setLoaded(true);

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

  const [showNsfwHistory, setShowNsfwHistory] = useState(true);
  const [nsfwKillSwitch, setNsfwKillSwitch] = useState(false);

  useEffect(() => {
    const load = () => {
      void getAppSettings().then((settings) => {
        setShowNsfwHistory(settings.privacy.showNsfwHistory);
        setNsfwKillSwitch(settings.privacy.nsfwKillSwitch);
      });
    };
    load();
    return subscribeAppSettings(load);
  }, []);

  const isNsfwEntry = useCallback(
    (entry: HistoryEntry) => {
      const source = findInstalledSource(installed, entry.sourceId);
      return (source?.manifest.info.contentRating ?? 0) >= 3;
    },
    [installed],
  );

  const { mainEntries, nsfwEntries } = useMemo(() => {
    const main: HistoryEntry[] = [];
    const nsfw: HistoryEntry[] = [];
    for (const entry of entries) {
      if (isNsfwEntry(entry)) nsfw.push(entry);
      else main.push(entry);
    }
    return { mainEntries: main, nsfwEntries: nsfw };
  }, [entries, isNsfwEntry]);

  const [activatedPages, setActivatedPages] = useState<Set<HistoryPageId>>(
    () => new Set<HistoryPageId>(["main"]),
  );
  const [selectedPage, setSelectedPage] = useState<HistoryPageId>("main");
  const pagerRef = useRef<PagerView>(null);
  const progress = useSharedValue(0);
  const mainCacheRef = useRef<Map<string, MangaHistoryGroup>>(new Map());
  const nsfwCacheRef = useRef<Map<string, MangaHistoryGroup>>(new Map());

  const illustration = useIllustrationMode();
  const showTabs = showNsfwHistory && !nsfwKillSwitch && !illustration;

  const mainRows = useMemo(() => {
    const result = buildRows(mainEntries, mainCacheRef.current);
    mainCacheRef.current = result.groups;
    return result.rows;
  }, [mainEntries]);

  const nsfwActive = showTabs && activatedPages.has("nsfw");
  const nsfwRows = useMemo(() => {
    if (!nsfwActive) return EMPTY_ROWS;
    const result = buildRows(nsfwEntries, nsfwCacheRef.current);
    nsfwCacheRef.current = result.groups;
    return result.rows;
  }, [nsfwActive, nsfwEntries]);

  const historyTabs = useMemo<LibraryCategoryTab[]>(
    () => [
      { id: "main", label: t("history_tab_main") },
      { id: "nsfw", label: t("history_tab_nsfw") },
    ],
    [],
  );

  const activatePage = useCallback((id: HistoryPageId) => {
    setActivatedPages((previous) =>
      previous.has(id) ? previous : new Set(previous).add(id),
    );
  }, []);

  const pageScrollHandler = usePageScrollHandler({
    onPageScroll: (event) => {
      "worklet";
      progress.value = event.position + event.offset;
    },
  });

  const handleTabPress = useCallback(
    (index: number) => {
      const id = historyTabs[index]?.id as HistoryPageId | undefined;
      if (!id) return;
      activatePage(id);
      pagerRef.current?.setPage(index);
    },
    [historyTabs, activatePage],
  );

  const handlePageSelected = useCallback(
    (index: number) => {
      const id = historyTabs[index]?.id as HistoryPageId | undefined;
      if (!id) return;
      setSelectedPage(id);
      activatePage(id);
      void Haptics.selectionAsync();
    },
    [historyTabs, activatePage],
  );

  const openManga = useCallback(
    (group: MangaHistoryGroup) => {
      const source = findInstalledSource(installedRef.current, group.sourceId);
      router.navigate(
        mangaHref(source ? sourceRouteId(source) : group.sourceId, {
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

  const hasEntries = showTabs ? entries.length > 0 : mainEntries.length > 0;

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
        return (
          <HistoryHeaderRow
            title={item.title}
            count={item.count}
            isFirst={item.isFirst}
            groups={item.groups}
            onChanged={requestReload}
          />
        );
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

  const { pagerHeight, onHeight: handlePageHeight } = usePagerHeights(
    ["main", "nsfw"],
    selectedPage === "nsfw" ? 1 : 0,
  );
  const { onScroll: handlePinnedScroll, spacer, renderTabs } =
    usePinnedTabs(showTabs);

  const renderRow = useCallback(
    (row: HistoryRow) =>
      renderItem({ item: row } as ListRenderItemInfo<HistoryRow>),
    [renderItem],
  );

  if (!loaded) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <Stack.Title large>{t("history")}</Stack.Title>
        <ScreenContent padded={false} scrollEnabled={false}>
          <HistorySkeleton />
        </ScreenContent>
      </>
    );
  }

  const renderPage = (
    rows: HistoryRow[],
    emptyKey: "main" | "nsfw",
    withHeaderInset: boolean,
  ) => {
    if (rows.length === 0) {
      return (
        <ScreenContent centerContent scrollEnabled={false}>
          <View style={styles.emptyWrap}>
            {withHeaderInset ? null : <IncognitoModeBanner />}
            <EmptyState
              icon={emptyKey === "nsfw" ? "eye-off-outline" : "time-outline"}
              title={t("history_empty_title")}
              description={t("history_empty_desc")}
            />
          </View>
        </ScreenContent>
      );
    }
    return (
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
    );
  };

  const renderTabPage = (rows: HistoryRow[], pageId: HistoryPageId) => {
    if (rows.length === 0) {
      return (
        <MeasuredPage pageId={pageId} onHeight={handlePageHeight}>
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={pageId === "nsfw" ? "eye-off-outline" : "time-outline"}
              title={t("history_empty_title")}
              description={t("history_empty_desc")}
            />
          </View>
        </MeasuredPage>
      );
    }
    return (
      <VirtualRows
        rows={rows}
        rowHeight={historyRowEstimate}
        keyOf={rowKeyExtractor}
        renderRow={renderRow}
        pageId={pageId}
        onHeight={handlePageHeight}
        style={styles.list}
      />
    );
  };

  if (!showTabs) {
    if (mainRows.length === 0) {
      return (
        <>
          <Stack.Screen options={screenOptions} />
          <Stack.Title large>{t("history")}</Stack.Title>
          {renderPage(mainRows, "main", false)}
        </>
      );
    }
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <Stack.Title large>{t("history")}</Stack.Title>
        <SwipeableRowsProvider>
          {renderPage(mainRows, "main", false)}
        </SwipeableRowsProvider>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <Stack.Title large>{t("history")}</Stack.Title>
      <View style={styles.root}>
        <LiquidGlassScrollComponent
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustsScrollIndicatorInsets
          showsVerticalScrollIndicator={false}
          onScroll={handlePinnedScroll}
          scrollEventThrottle={16}
        >
          <IncognitoModeBanner />
          {spacer}
          <SwipeableRowsProvider>
            <AnimatedPagerView
              ref={pagerRef}
              style={{ height: pagerHeight }}
              initialPage={selectedPage === "nsfw" ? 1 : 0}
              onPageScroll={pageScrollHandler}
              onPageSelected={(event) =>
                handlePageSelected(event.nativeEvent.position)
              }
              offscreenPageLimit={1}
            >
              <View key="main" collapsable={false} style={styles.root}>
                {renderTabPage(mainRows, "main")}
              </View>
              <View key="nsfw" collapsable={false} style={styles.root}>
                {nsfwActive ? (
                  renderTabPage(nsfwRows, "nsfw")
                ) : (
                  <MeasuredPage pageId="nsfw" onHeight={handlePageHeight}>
                    <HistorySkeleton />
                  </MeasuredPage>
                )}
              </View>
            </AnimatedPagerView>
          </SwipeableRowsProvider>
          {renderTabs(
            <LibraryCategoryTabs
              fullWidth
              tabs={historyTabs}
              progress={progress}
              onPress={handleTabPress}
            />,
          )}
        </LiquidGlassScrollComponent>
      </View>
    </>
  );
}

const EMPTY_ROWS: HistoryRow[] = [];

type HistoryPageId = "main" | "nsfw";

function historyRowEstimate(row: HistoryRow): number {
  return row.kind === "header" ? 44 : 120;
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontWeight: "700",
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitleFirst: {
    marginTop: Spacing.sm,
  },
  sectionTitleNext: {
    marginTop: Spacing.lg,
  },
  groupRow: {
    marginBottom: Spacing.md,
  },
  emptyWrap: {
    width: "100%",
    alignItems: "stretch",
  },
  mangaGroup: {
    overflow: "hidden",
  },
  mangaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  cover: {
    width: 56,
    height: 80,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  mangaMeta: {
    flex: 1,
    gap: 4,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sourceChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    maxWidth: "100%",
  },
  chapterList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.xs,
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
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
  pageChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
  },
  showMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
});
