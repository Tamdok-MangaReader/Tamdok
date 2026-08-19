import { useEffect, useMemo, useState } from 'react';

import { useMangaDataRefresh } from '@/hooks/use-manga-data';
import { getAppSettings } from '@/services/app-settings';
import { getLibraryEntries, type LibraryEntry } from '@/services/library';

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
  const [showBadges, setShowBadges] = useState({ unread: true, downloaded: true });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [libraryEntries, appSettings] = await Promise.all([getLibraryEntries(), getAppSettings()]);
      if (cancelled) return;
      setEntries(libraryEntries);
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
      map.set(metaKey(entry.sourceId, entry.mangaKey), {
        inLibrary: true,
        unreadCount: entry.unreadCount ?? 0,
        downloadedCount: entry.downloadedCount ?? 0,
        updateFailed: Boolean(entry.updateFailed),
      });
    }
    return map;
  }, [entries]);

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
  T extends { key: string; inLibrary?: boolean; unreadCount?: number; downloadedCount?: number; updateFailed?: boolean },
>(
  manga: T,
  sourceId: string | undefined,
  getMeta: (sourceId: string | undefined, mangaKey: string) => LibraryMangaMeta | undefined,
) {
  if (manga.inLibrary === true) {
    return {
      ...manga,
      inLibrary: true,
      unreadCount: manga.unreadCount ?? 0,
      downloadedCount: manga.downloadedCount ?? 0,
      updateFailed: Boolean(manga.updateFailed),
    };
  }

  const meta = getMeta(sourceId, manga.key);
  return {
    ...manga,
    inLibrary: Boolean(meta?.inLibrary),
    unreadCount: meta?.unreadCount ?? 0,
    downloadedCount: meta?.downloadedCount ?? 0,
    updateFailed: Boolean(meta?.updateFailed),
  };
}
