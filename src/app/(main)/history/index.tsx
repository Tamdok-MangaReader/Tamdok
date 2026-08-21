import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { HistoryOverflowMenu } from '@/components/history/history-overflow-menu';
import { SwipeableRow, SwipeableRowsProvider, type SwipeAction } from '@/components/sources/swipeable-row';
import { IncognitoModeBanner } from '@/components/settings/incognito-mode-banner';
import { EmptyState } from '@/components/ui/empty-state';
import { LiquidGlassScrollComponent } from '@/components/ui/liquid-glass-scroll-root';
import { ScreenContent } from '@/components/ui/screen-content';
import { ThemedText } from '@/components/ui/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { chaptersOldestFirst, formatEntryChapterLabel } from '@/utils/chapter-label';
import { SourceCoverHeadersProvider, useSourceCoverHeaders, useSourceCoverHeadersReady } from '@/context/source-cover-context';
import { useSources } from '@/context/sources-context';
import { useMangaDataRefresh } from '@/hooks/use-manga-data';
import { useTheme } from '@/hooks/use-theme';
import { getLibraryEntries } from '@/services/library';
import { getHistoryEntries, removeChapterFromHistory, removeHistorySince, removeMangaHistoryGroup, type HistoryEntry } from '@/services/manga-tracking';
import { peekMangaDetailCache } from '@/services/manga-detail-cache';
import { findInstalledSource, sourceRouteId } from '@/services/sources';
import { coverImageSource } from '@/utils/cover-image-source';
import { IMAGE_CACHE_POLICY } from '@/utils/image-memory';
import { mangaHref, readerHref } from '@/utils/manga-route';

const VISIBLE_CHAPTER_LIMIT = 5;

type MangaHistoryGroup = {
  key: string;
  sourceId: string;
  mangaKey: string;
  mangaTitle: string;
  cover?: string;
  chapters: HistoryEntry[];
};

type HistoryDateSection = {
  title: string;
  groups: MangaHistoryGroup[];
};

function startOfLocalDay(daysAgo = 0): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (daysAgo) date.setDate(date.getDate() - daysAgo);
  return date.getTime();
}

function formatHistoryDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return t('history_today');
  if (date.toDateString() === yesterday.toDateString()) return t('history_yesterday');
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatHistoryTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatMangaTimeRange(chapters: HistoryEntry[]): string {
  if (chapters.length === 0) return '';
  const sorted = [...chapters].sort((a, b) => a.dateRead - b.dateRead);
  const first = formatHistoryTime(sorted[0]!.dateRead);
  const last = formatHistoryTime(sorted[sorted.length - 1]!.dateRead);
  if (first === last) return first;
  return `${first} – ${last}`;
}

function buildSections(entries: HistoryEntry[]): HistoryDateSection[] {
  const byDate = new Map<string, HistoryEntry[]>();

  for (const entry of entries) {
    const label = formatHistoryDate(entry.dateRead);
    const bucket = byDate.get(label) ?? [];
    bucket.push(entry);
    byDate.set(label, bucket);
  }

  return [...byDate.entries()].map(([title, dateEntries]) => {
    const byManga = new Map<string, HistoryEntry[]>();
    for (const entry of dateEntries) {
      const key = `${entry.sourceId}:${entry.mangaKey}`;
      const bucket = byManga.get(key) ?? [];
      bucket.push(entry);
      byManga.set(key, bucket);
    }

    const groups = [...byManga.entries()].map(([key, chapters]) => {
      const sorted = [...chapters].sort((a, b) => b.dateRead - a.dateRead);
      const first = sorted[0]!;
      return {
        key,
        sourceId: first.sourceId,
        mangaKey: first.mangaKey,
        mangaTitle: first.mangaTitle,
        cover: first.cover,
        chapters: sorted,
      };
    });

    groups.sort((a, b) => b.chapters[0]!.dateRead - a.chapters[0]!.dateRead);
    return { title, groups };
  });
}

function sourceKindLabel(kind: string): string {
  return kind.toUpperCase();
}

function formatHistoryChapterLabel(entry: HistoryEntry): string {
  const chapters = peekMangaDetailCache(entry.sourceId, entry.mangaKey)?.manga.chapters;
  const chapter = chapters?.find((item) => item.key === entry.chapterKey);
  const ordinal = chapter && chapters?.length ? chaptersOldestFirst(chapters).findIndex((item) => item.key === entry.chapterKey) + 1 : undefined;
  return formatEntryChapterLabel(chapter, entry.chapterTitle, entry.chapterKey, ordinal || undefined);
}

function HistoryMangaGroup({
  group,
  onOpenManga,
  onChanged,
}: {
  group: MangaHistoryGroup;
  onOpenManga: (group: MangaHistoryGroup) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { installed } = useSources();
  const { colors, radius } = useTheme();
  const coverHeaders = useSourceCoverHeaders();
  const coverHeadersReady = useSourceCoverHeadersReady();
  const [expanded, setExpanded] = useState(false);

  const source = findInstalledSource(installed, group.sourceId);
  const hiddenCount = Math.max(0, group.chapters.length - VISIBLE_CHAPTER_LIMIT);
  const visibleChapters = expanded || hiddenCount === 0 ? group.chapters : group.chapters.slice(0, VISIBLE_CHAPTER_LIMIT);

  const sourceLabel = source ? `${source.manifest.info.name} · ${sourceKindLabel(source.kind)}` : group.sourceId;

  const timeRange = formatMangaTimeRange(group.chapters);

  const openChapter = (entry: HistoryEntry) => {
    if (!source) return;
    const page = entry.page != null && entry.page >= 0 ? entry.page : undefined;
    router.navigate(
      readerHref(sourceRouteId(source), entry.mangaKey, entry.chapterKey, entry.chapterTitle ?? entry.chapterKey, entry.mangaTitle, page, entry.cover),
    );
  };

  const deleteMangaAction: SwipeAction = {
    key: 'delete',
    label: t('history_delete_manga'),
    icon: 'trash-outline',
    sfSymbol: 'trash',
    color: colors.destructive,
    onPress: () => {
      void removeMangaHistoryGroup(
        group.sourceId,
        group.mangaKey,
        group.chapters.map((chapter) => chapter.chapterKey),
      ).then(onChanged);
    },
  };

  const deleteChapterAction = (entry: HistoryEntry): SwipeAction => ({
    key: 'delete',
    label: t('history_delete_chapter'),
    icon: 'trash-outline',
    sfSymbol: 'trash',
    color: colors.destructive,
    onPress: () => {
      void removeChapterFromHistory(entry.sourceId, entry.mangaKey, entry.chapterKey).then(onChanged);
    },
  });

  const mangaRow = (
    <Pressable style={({ pressed }) => [styles.mangaRow, pressed && { opacity: 0.72 }]} onPress={() => onOpenManga(group)}>
      <View style={[styles.cover, { borderRadius: radius.sm, backgroundColor: colors.secondaryFill }]}>
        {group.cover && coverHeadersReady ? (
          <Image
            source={coverImageSource(group.cover, coverHeaders)}
            style={StyleSheet.absoluteFill}
            contentFit='cover'
            cachePolicy={IMAGE_CACHE_POLICY}
            allowDownscaling
          />
        ) : (
          <ThemedText variant='title3' color='tertiaryLabel'>
            {group.mangaTitle.slice(0, 1)}
          </ThemedText>
        )}
      </View>
      <View style={styles.mangaMeta}>
        <ThemedText variant='body' numberOfLines={2}>
          {group.mangaTitle}
        </ThemedText>
        <ThemedText variant='footnote' color='secondaryLabel' numberOfLines={1}>
          {sourceLabel}
        </ThemedText>
        {timeRange ? (
          <ThemedText variant='caption1' color='tertiaryLabel'>
            {timeRange}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <View style={styles.mangaGroup}>
      <SwipeableRow rowId={`${group.key}:manga`} actions={[deleteMangaAction]} fullSwipeActionKey='delete'>
        {mangaRow}
      </SwipeableRow>

      {group.chapters.length > 0 ? (
        <View style={[styles.chapterList, { borderLeftColor: colors.separator }]}>
          {visibleChapters.map((chapter) => (
            <SwipeableRow
              key={`${chapter.chapterKey}:${chapter.dateRead}`}
              rowId={`${group.key}:${chapter.chapterKey}:${chapter.dateRead}`}
              actions={[deleteChapterAction(chapter)]}
              fullSwipeActionKey='delete'>
              <Pressable style={({ pressed }) => [styles.chapterRow, pressed && { opacity: 0.72 }]} onPress={() => openChapter(chapter)}>
                <ThemedText variant='subheadline' numberOfLines={2} style={styles.chapterTitle}>
                  {formatHistoryChapterLabel(chapter)}
                </ThemedText>
                <View style={styles.chapterMeta}>
                  {chapter.page != null && chapter.page >= 0 ? (
                    <ThemedText variant='caption1' color='secondaryLabel'>
                      {t('history_on_page', { page: String(chapter.page + 1) })}
                    </ThemedText>
                  ) : null}
                  <ThemedText variant='caption1' color='tertiaryLabel'>
                    {formatHistoryTime(chapter.dateRead)}
                  </ThemedText>
                </View>
              </Pressable>
            </SwipeableRow>
          ))}

          {hiddenCount > 0 && !expanded ? (
            <Pressable style={styles.showMoreButton} onPress={() => setExpanded(true)} accessibilityRole='button'>
              <ThemedText variant='subheadline' color='tint'>
                {t('history_show_more', { count: String(hiddenCount) })}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const { installed } = useSources();
  const refreshTick = useMangaDataRefresh();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const loadHistory = useCallback(async () => {
    const [history, libraryEntries] = await Promise.all([getHistoryEntries(), getLibraryEntries()]);
    const libraryMeta = new Map(libraryEntries.map((entry) => [`${entry.sourceId}:${entry.mangaKey}`, entry] as const));

    setEntries(
      history.map((entry) => {
        const libraryEntry = libraryMeta.get(`${entry.sourceId}:${entry.mangaKey}`);
        const cached = peekMangaDetailCache(entry.sourceId, entry.mangaKey)?.manga;
        return {
          ...entry,
          mangaTitle: entry.mangaTitle && entry.mangaTitle !== entry.mangaKey ? entry.mangaTitle : (libraryEntry?.title ?? cached?.title ?? entry.mangaTitle),
          cover: entry.cover ?? libraryEntry?.cover ?? cached?.cover,
        };
      }),
    );
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, refreshTick]);

  const sections = useMemo(() => buildSections(entries), [entries]);

  const openManga = (group: MangaHistoryGroup) => {
    const source = findInstalledSource(installed, group.sourceId);
    if (!source) return;
    router.navigate(
      mangaHref(sourceRouteId(source), {
        key: group.mangaKey,
        title: group.mangaTitle,
        cover: group.cover,
      }),
    );
  };

  const confirmClear = (title: string, message: string, cutoffMs: number) => {
    Alert.alert(title, message, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('history_clear_action'),
        style: 'destructive',
        onPress: () => {
          void removeHistorySince(cutoffMs).then(loadHistory);
        },
      },
    ]);
  };

  const headerRight =
    entries.length > 0 ? (
      <HistoryOverflowMenu
        onClearToday={() => confirmClear(t('history_clear_today'), t('history_clear_today_confirm'), startOfLocalDay())}
        onClearWeek={() => confirmClear(t('history_clear_week'), t('history_clear_week_confirm'), startOfLocalDay(6))}
        onClearAll={() => confirmClear(t('history_clear_all'), t('history_clear_all_confirm'), 0)}
      />
    ) : undefined;

  if (entries.length === 0) {
    return (
      <>
        <Stack.Screen options={{ headerRight: () => null }} />
        <Stack.Title>{t('history')}</Stack.Title>
        <ScreenContent centerContent>
          <View style={styles.emptyWrap}>
            <IncognitoModeBanner />
            <EmptyState icon='time-outline' title={t('history_empty_title')} description={t('history_empty_desc')} />
          </View>
        </ScreenContent>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerRight: () => headerRight }} />
      <Stack.Title>{t('history')}</Stack.Title>
      <SwipeableRowsProvider>
        <FlatList
          style={styles.root}
          data={sections}
          keyExtractor={(item) => item.title}
          contentInsetAdjustmentBehavior='automatic'
          automaticallyAdjustsScrollIndicatorInsets
          contentContainerStyle={styles.list}
          ListHeaderComponent={<IncognitoModeBanner />}
          renderScrollComponent={(props) => <LiquidGlassScrollComponent {...props} />}
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              <ThemedText variant='headline' style={styles.sectionTitle}>
                {section.title}
              </ThemedText>
              {section.groups.map((group) => (
                <SourceCoverHeadersProvider key={`${section.title}:${group.key}`} source={findInstalledSource(installed, group.sourceId)}>
                  <HistoryMangaGroup group={group} onOpenManga={openManga} onChanged={loadHistory} />
                </SourceCoverHeadersProvider>
              ))}
            </View>
          )}
        />
      </SwipeableRowsProvider>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    flexGrow: 1,
    padding: Spacing.lg,
    gap: Spacing.xl,
    paddingBottom: BottomTabInset + Spacing.lg,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    paddingHorizontal: Spacing.xs,
  },
  emptyWrap: {
    width: '100%',
    alignItems: 'stretch',
  },
  mangaGroup: {
    gap: Spacing.xs,
  },
  mangaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  cover: {
    width: 48,
    height: 68,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  chapterTitle: {
    flex: 1,
  },
  chapterMeta: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  showMoreButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
});
