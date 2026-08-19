import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { SwipeableRow, SwipeableRowsProvider, type SwipeAction } from '@/components/sources/swipeable-row';
import { Card, CardSeparator } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { ScreenContent } from '@/components/ui/screen-content';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { SourceCoverHeadersProvider, useSourceCoverHeaders, useSourceCoverHeadersReady } from '@/context/source-cover-context';
import { useSources } from '@/context/sources-context';
import { useMangaDataRefresh } from '@/hooks/use-manga-data';
import { useTheme } from '@/hooks/use-theme';
import { getAppSettings, updateAppSettings } from '@/services/app-settings';
import {
  clearFailedDownloads,
  getDownloads,
  removeChapterDownload,
  removeMangaDownloads,
  type DownloadEntry,
} from '@/services/downloads';
import { processQueuedDownloads } from '@/services/download-processor';
import { getLibraryEntries } from '@/services/library';
import { peekMangaDetailCache } from '@/services/manga-detail-cache';
import { findInstalledSource, sourceRouteId } from '@/services/sources';
import { coverImageSource } from '@/utils/cover-image-source';
import { mangaHref } from '@/utils/manga-route';

type DownloadMangaGroup = {
  key: string;
  sourceId: string;
  mangaKey: string;
  mangaTitle: string;
  cover?: string;
  chapters: DownloadEntry[];
};

const VISIBLE_CHAPTER_LIMIT = 3;

function parseChapterSortNumber(entry: DownloadEntry, cachedNumber?: number): number {
  if (cachedNumber != null && Number.isFinite(cachedNumber)) return cachedNumber;
  const text = `${entry.chapterTitle ?? ''} ${entry.chapterKey}`;
  const named = text.match(/(?:ch(?:apter)?|гл(?:ава)?)\.?\s*(\d+(?:[.,]\d+)?)/i);
  const picked = named?.[1] ?? text.match(/(\d+(?:[.,]\d+)?)\s*$/)?.[1] ?? text.match(/(\d+(?:[.,]\d+)?)/)?.[1];
  if (!picked) return Number.NEGATIVE_INFINITY;
  const value = Number.parseFloat(picked.replace(',', '.'));
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function sortDownloadsByChapterNumber(chapters: DownloadEntry[], sourceId: string, mangaKey: string): DownloadEntry[] {
  const cached = peekMangaDetailCache(sourceId, mangaKey)?.manga.chapters ?? [];
  const numbers = new Map(cached.map((chapter) => [chapter.key, chapter.chapterNumber]));
  return [...chapters].sort((a, b) => {
    const aNumber = parseChapterSortNumber(a, numbers.get(a.chapterKey));
    const bNumber = parseChapterSortNumber(b, numbers.get(b.chapterKey));
    if (aNumber !== bNumber) return bNumber - aNumber;
    return (b.chapterTitle ?? b.chapterKey).localeCompare(a.chapterTitle ?? a.chapterKey, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

function formatStatus(entry: DownloadEntry): string {
  if (entry.status === 'completed') return t('downloads_status_completed');
  if (entry.status === 'failed') return t('downloads_status_failed');
  if (entry.status === 'downloading') return t('downloads_status_downloading');
  return t('downloads_status_pending');
}

function sourceKindLabel(kind: string): string {
  return kind.toUpperCase();
}

function DownloadMangaGroupRow({
  group,
  onOpenManga,
  onChanged,
}: {
  group: DownloadMangaGroup;
  onOpenManga: (group: DownloadMangaGroup) => void;
  onChanged: () => void;
}) {
  const { installed } = useSources();
  const { colors, radius } = useTheme();
  const coverHeaders = useSourceCoverHeaders();
  const coverHeadersReady = useSourceCoverHeadersReady();
  const [expanded, setExpanded] = useState(false);
  const source = findInstalledSource(installed, group.sourceId);
  const sourceLabel = source
    ? `${source.manifest.info.name} · ${sourceKindLabel(source.kind)}`
    : group.sourceId;
  const hiddenCount = Math.max(0, group.chapters.length - VISIBLE_CHAPTER_LIMIT);
  const visibleChapters =
    expanded || hiddenCount === 0 ? group.chapters : group.chapters.slice(0, VISIBLE_CHAPTER_LIMIT);

  const deleteMangaAction: SwipeAction = {
    key: 'delete',
    label: t('downloads_delete_manga'),
    icon: 'trash-outline',
    sfSymbol: 'trash',
    color: colors.destructive,
    onPress: () => {
      void removeMangaDownloads(group.sourceId, group.mangaKey).then(onChanged);
    },
  };

  const deleteChapterAction = (entry: DownloadEntry): SwipeAction => ({
    key: 'delete',
    label: t('downloads_delete_chapter'),
    icon: 'trash-outline',
    sfSymbol: 'trash',
    color: colors.destructive,
    onPress: () => {
      void removeChapterDownload(entry.sourceId, entry.mangaKey, entry.chapterKey).then(onChanged);
    },
  });

  return (
    <View style={styles.mangaGroup}>
      <SwipeableRow rowId={`${group.key}:manga`} actions={[deleteMangaAction]} fullSwipeActionKey='delete'>
        <Pressable
          style={({ pressed }) => [styles.mangaRow, pressed && { opacity: 0.72 }]}
          onPress={() => onOpenManga(group)}>
          <View style={[styles.cover, { borderRadius: radius.sm, backgroundColor: colors.secondaryFill }]}>
            {group.cover && coverHeadersReady ? (
              <Image
                source={coverImageSource(group.cover, coverHeaders)}
                style={StyleSheet.absoluteFill}
                contentFit='cover'
                cachePolicy='memory-disk'
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
            <ThemedText variant='caption1' color='tertiaryLabel'>
              {t('downloads_chapter_count', { count: String(group.chapters.length) })}
            </ThemedText>
          </View>
        </Pressable>
      </SwipeableRow>

      {group.chapters.length > 0 ? (
        <View style={[styles.chapterList, { borderLeftColor: colors.separator }]}>
          {visibleChapters.map((chapter) => (
            <SwipeableRow
              key={`${chapter.chapterKey}:${chapter.dateAdded}`}
              rowId={`${group.key}:${chapter.chapterKey}`}
              actions={[deleteChapterAction(chapter)]}
              fullSwipeActionKey='delete'>
              <View style={styles.chapterRow}>
                <ThemedText variant='subheadline' numberOfLines={2} style={styles.chapterTitle}>
                  {chapter.chapterTitle?.trim() || chapter.chapterKey}
                </ThemedText>
                <ThemedText variant='caption1' color='secondaryLabel'>
                  {formatStatus(chapter)}
                </ThemedText>
              </View>
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

export default function DownloadsSettingsScreen() {
  const router = useRouter();
  const { installed } = useSources();
  const refreshTick = useMangaDataRefresh();
  const [entries, setEntries] = useState<DownloadEntry[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [downloadOnlyOnWifi, setDownloadOnlyOnWifi] = useState(false);
  const [deleteAfterReading, setDeleteAfterReading] = useState(false);

  const load = useCallback(async () => {
    const [downloads, settings, libraryEntries] = await Promise.all([
      getDownloads(),
      getAppSettings(),
      getLibraryEntries(),
    ]);
    const nextCovers: Record<string, string> = {};
    for (const entry of libraryEntries) {
      if (entry.cover) nextCovers[`${entry.sourceId}:${entry.mangaKey}`] = entry.cover;
    }
    for (const entry of downloads) {
      const key = `${entry.sourceId}:${entry.mangaKey}`;
      if (nextCovers[key]) continue;
      const cached = peekMangaDetailCache(entry.sourceId, entry.mangaKey)?.manga.cover;
      if (cached) nextCovers[key] = cached;
    }
    setEntries(downloads);
    setCovers(nextCovers);
    setDownloadOnlyOnWifi(settings.downloads.downloadOnlyOnWifi);
    setDeleteAfterReading(settings.downloads.deleteAfterReading);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const processQueue = useCallback(async () => {
    setProcessing(true);
    try {
      await processQueuedDownloads(installed);
      await load();
    } finally {
      setProcessing(false);
    }
  }, [installed, load]);

  useEffect(() => {
    void processQueue();
  }, []);

  const groups = useMemo<DownloadMangaGroup[]>(() => {
    const byManga = new Map<string, DownloadEntry[]>();
    for (const entry of entries) {
      const key = `${entry.sourceId}:${entry.mangaKey}`;
      const bucket = byManga.get(key) ?? [];
      bucket.push(entry);
      byManga.set(key, bucket);
    }

    return [...byManga.entries()]
      .map(([key, chapters]) => {
        const first = chapters[0]!;
        return {
          key,
          sourceId: first.sourceId,
          mangaKey: first.mangaKey,
          mangaTitle: first.mangaTitle,
          cover: covers[key],
          chapters: sortDownloadsByChapterNumber(chapters, first.sourceId, first.mangaKey),
        };
      })
      .sort((a, b) => {
        const aLatest = Math.max(...a.chapters.map((chapter) => chapter.dateAdded));
        const bLatest = Math.max(...b.chapters.map((chapter) => chapter.dateAdded));
        return bLatest - aLatest;
      });
  }, [covers, entries]);

  const openManga = (group: DownloadMangaGroup) => {
    const source = findInstalledSource(installed, group.sourceId);
    if (!source) return;
    router.push(
      mangaHref(sourceRouteId(source), {
        key: group.mangaKey,
        title: group.mangaTitle,
        cover: group.cover,
      }),
    );
  };

  const clearFailed = () => {
    Alert.alert(t('downloads_clear_failed'), undefined, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('downloads_clear_failed'),
        style: 'destructive',
        onPress: () => {
          void clearFailedDownloads().then(load);
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('downloads_settings_title'),
          headerRight: () => (
            <ThemedText variant='body' color='tint' onPress={() => void processQueue()} style={{ paddingHorizontal: 8 }}>
              {t('downloads_process_queue')}
            </ThemedText>
          ),
        }}
      />
      <SwipeableRowsProvider>
        <ScreenContent>
          {processing ? <ActivityIndicator style={{ marginBottom: Spacing.md }} /> : null}

          <SectionLabel isFirst>{t('downloads_preferences_section')}</SectionLabel>
          <Card>
            <View style={styles.switchRow}>
              <ThemedText variant='body' style={{ flex: 1 }}>
                {t('downloads_wifi_only')}
              </ThemedText>
              <Switch
                value={downloadOnlyOnWifi}
                onValueChange={(value) => {
                  setDownloadOnlyOnWifi(value);
                  void updateAppSettings({ downloads: { downloadOnlyOnWifi: value, deleteAfterReading } });
                }}
              />
            </View>
            <CardSeparator />
            <View style={styles.switchRow}>
              <ThemedText variant='body' style={{ flex: 1 }}>
                {t('downloads_delete_after_reading')}
              </ThemedText>
              <Switch
                value={deleteAfterReading}
                onValueChange={(value) => {
                  setDeleteAfterReading(value);
                  void updateAppSettings({ downloads: { downloadOnlyOnWifi, deleteAfterReading: value } });
                }}
              />
            </View>
          </Card>

          <SectionLabel>{t('downloads_queue')}</SectionLabel>
          {groups.length === 0 ? (
            <ThemedText variant='body' color='secondaryLabel' style={{ textAlign: 'center', paddingHorizontal: Spacing.lg }}>
              {t('downloads_empty')}
            </ThemedText>
          ) : (
            <View style={styles.queue}>
              {groups.map((group) => (
                <SourceCoverHeadersProvider key={group.key} source={findInstalledSource(installed, group.sourceId)}>
                  <DownloadMangaGroupRow group={group} onOpenManga={openManga} onChanged={load} />
                </SourceCoverHeadersProvider>
              ))}
            </View>
          )}

          <SectionLabel>{t('downloads_actions')}</SectionLabel>
          <Card>
            <ListRow label={t('downloads_process_queue')} onPress={() => void processQueue()} isFirst />
            <CardSeparator />
            <ListRow label={t('downloads_clear_failed')} onPress={clearFailed} isLast />
          </Card>
        </ScreenContent>
      </SwipeableRowsProvider>
    </>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  queue: {
    gap: Spacing.md,
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
  showMoreButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
});
