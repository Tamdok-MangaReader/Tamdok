import type { Manga } from '@/parsers/shared/types';

import type { GlobalSearchContentFilter } from '@/components/search/global-search-filter-bar';

export function filterMangaByContent(entries: Manga[], contentFilter: GlobalSearchContentFilter): Manga[] {
  switch (contentFilter) {
    case 'safe':
      return entries.filter((entry) => entry.contentRating !== 'nsfw');
    case 'nsfw':
      return entries.filter((entry) => entry.contentRating === 'nsfw');
    default:
      return entries;
  }
}
