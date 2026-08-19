import { MangaCover } from '@/components/manga/manga-cover';
import { enrichMangaWithLibraryMeta, useLibraryLookup } from '@/hooks/use-library-lookup';
import type { Manga } from '@/parsers/shared/types';

type LibraryMangaCoverProps = {
  sourceId?: string;
  manga: Manga;
  cover?: string;
  width: number;
  showTitleOverlay?: boolean;
  onPress?: () => void;
};

export function LibraryMangaCover({ sourceId, manga, cover, width, showTitleOverlay, onPress }: LibraryMangaCoverProps) {
  const { getMeta } = useLibraryLookup();
  const enriched = enrichMangaWithLibraryMeta(manga, sourceId, getMeta);

  return (
    <MangaCover
      title={manga.title}
      cover={cover ?? manga.cover}
      width={width}
      inLibrary={enriched.inLibrary}
      unreadCount={enriched.unreadCount}
      downloadedCount={enriched.downloadedCount}
      updateFailed={enriched.updateFailed}
      showTitleOverlay={showTitleOverlay ?? true}
      onPress={onPress}
    />
  );
}
