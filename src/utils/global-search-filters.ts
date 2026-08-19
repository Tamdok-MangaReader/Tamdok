import type { Manga } from '@/parsers/shared/types';

import type { GlobalSearchContentFilter } from '@/components/search/global-search-filter-bar';

export function filterMangaByContent(entries: Manga[], contentFilter: GlobalSearchContentFilter): Manga[] {
  switch (contentFilter) {
    case 'safe':
      return entries.filter((entry) => !entry.contentRating || entry.contentRating === 'safe');
    case 'nsfw':
      return entries.filter((entry) => entry.contentRating === 'nsfw' || entry.contentRating === 'suggestive');
    default:
      return entries;
  }
}
