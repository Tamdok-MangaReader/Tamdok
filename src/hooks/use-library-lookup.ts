import { useEffect, useMemo, useState } from 'react';

import { useMangaDataRefresh } from '@/hooks/use-manga-data';
import { getAppSettings } from '@/services/app-settings';
import { getLibraryEntries, resolveLibraryUnreadCount, type LibraryEntry } from '@/services/library';
import { getReadChapterKeysByManga } from '@/services/manga-tracking';

export type LibraryMangaMeta = {
  inLibrary: true;
  unreadCount: number;
  downloadedCount: number;
  updateFailed: boolean;
};

function metaKey(sourceId: string, mangaKey: string): string {
  return `${sourceId}:${mangaKey}`;
}

export function useLibraryLookup() {
  const refreshTick = useMangaDataRefresh();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [readKeysByManga, setReadKeysByManga] = useState<Map<string, Set<string>>>(() => new Map());
  const [showBadges, setShowBadges] = useState({ unread: true, downloaded: true });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [libraryEntries, appSettings, readKeys] = await Promise.all([
        getLibraryEntries(),
        getAppSettings(),
        getReadChapterKeysByManga(),
      ]);
      if (cancelled) return;
      setEntries(libraryEntries);
      setReadKeysByManga(readKeys);
      setShowBadges({
        unread: appSettings.libraryDisplay.showUnreadBadges,
        downloaded: appSettings.libraryDisplay.showDownloadedBadges,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const lookup = useMemo(() => {
    const map = new Map<string, LibraryMangaMeta>();
    for (const entry of entries) {
      const key = metaKey(entry.sourceId, entry.mangaKey);
      map.set(key, {
        inLibrary: true,
        unreadCount: resolveLibraryUnreadCount(entry, readKeysByManga.get(key)),
        downloadedCount: entry.downloadedCount ?? 0,
        updateFailed: Boolean(entry.updateFailed),
      });
    }
    return map;
  }, [entries, readKeysByManga]);

  const getMeta = (sourceId: string | undefined, mangaKey: string): LibraryMangaMeta | undefined => {
    if (!sourceId) return undefined;
    const meta = lookup.get(metaKey(sourceId, mangaKey));
    if (!meta) return undefined;
    return {
      inLibrary: true,
      unreadCount: showBadges.unread ? meta.unreadCount : 0,
      downloadedCount: showBadges.downloaded ? meta.downloadedCount : 0,
      updateFailed: meta.updateFailed,
    };
  };

  return { getMeta, showBadges };
}

export function enrichMangaWithLibraryMeta<
  T extends { key: string; sourceId?: string; inLibrary?: boolean; unreadCount?: number; downloadedCount?: number; updateFailed?: boolean },
>(
  manga: T,
  sourceId: string | undefined,
  getMeta: (sourceId: string | undefined, mangaKey: string) => LibraryMangaMeta | undefined,
) {
  const meta = getMeta(sourceId ?? manga.sourceId, manga.key);
  if (meta) {
    return {
      ...manga,
      inLibrary: true as const,
      unreadCount: meta.unreadCount,
      downloadedCount: meta.downloadedCount,
      updateFailed: meta.updateFailed,
    };
  }

  return {
    ...manga,
    inLibrary: Boolean(manga.inLibrary),
    unreadCount: manga.unreadCount ?? 0,
    downloadedCount: manga.downloadedCount ?? 0,
    updateFailed: Boolean(manga.updateFailed),
  };
}
