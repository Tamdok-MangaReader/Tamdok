import { MangaCover } from "@/components/manga/manga-cover";
import {
  enrichMangaWithLibraryMeta,
  useLibraryLookup,
} from "@/hooks/use-library-lookup";
import type { Manga } from "@/parsers/shared/types";
import { ParsedRating } from "@/utils/manga-description";

type LibraryMangaCoverProps = {
  sourceId?: string;
  manga: Manga;
  cover?: string;
  rating?: ParsedRating;
  isRatingCompact?: boolean;
  width: number;
  showTitleOverlay?: boolean;
  onPress?: () => void;
};

export function LibraryMangaCover({
  sourceId,
  manga,
  cover,
  rating,
  isRatingCompact = true,
  width,
  showTitleOverlay,
  onPress,
}: LibraryMangaCoverProps) {
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
      showStatus={manga.status && true}
      mangaStatus={manga.status}
      updateFailed={enriched.updateFailed}
      showTitleOverlay={showTitleOverlay ?? true}
      rating={rating}
      isRatingCompact={isRatingCompact}
      onPress={onPress}
    />
  );
}
