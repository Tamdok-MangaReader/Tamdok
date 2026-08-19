import type { Href } from 'expo-router';

import type { FilterValue, InstalledSource, Manga } from '@/parsers/shared/types';
import { sourceRouteId } from '@/services/sources';

export function mangaHref(source: Pick<InstalledSource, 'kind' | 'id'> | string, manga: Manga): Href {
  const routeId = typeof source === 'string' ? source : sourceRouteId(source);

  return {
    pathname: '/manga/detail',
    params: {
      sourceId: routeId,
      mangaKey: manga.key,
      title: manga.title,
      ...(manga.cover ? { cover: manga.cover } : {}),
      ...(manga.url ? { url: manga.url } : {}),
    },
  } as Href;
}

export function decodeMangaKey(encoded: string): string {
  return decodeURIComponent(encoded);
}

export function mangaFromParams(sourceId: string, mangaKey: string, title?: string, cover?: string, url?: string): Manga {
  return {
    key: decodeMangaKey(mangaKey),
    title: title ?? decodeMangaKey(mangaKey),
    cover: cover || undefined,
    url: url || undefined,
  };
}

export function readerHref(
  source: Pick<InstalledSource, 'kind' | 'id'> | string,
  mangaKey: string,
  chapterKey: string,
  chapterTitle: string,
  mangaTitle: string,
  initialPage?: number,
  cover?: string,
): Href {
  const routeId = typeof source === 'string' ? source : sourceRouteId(source);

  return {
    pathname: '/reader',
    params: {
      sourceId: routeId,
      mangaKey,
      chapterKey,
      chapterTitle,
      mangaTitle,
      ...(cover ? { cover } : {}),
      ...(initialPage != null && initialPage > 0 ? { page: String(initialPage) } : {}),
    },
  } as Href;
}

export function sourceListingHref(sourceId: string, listingId: string, listingName?: string): Href {
  return {
    pathname: `/sources/${encodeURIComponent(sourceId)}/listing`,
    params: {
      listingId,
      listingName: listingName ?? listingId,
    },
  } as Href;
}

export function sourceSearchHref(sourceId: string, query?: string, filters?: FilterValue[]): Href {
  const pathname = `/sources/${encodeURIComponent(sourceId)}/search`;
  if (!query && !filters?.length) return pathname as Href;
  return {
    pathname,
    params: {
      ...(query ? { q: query } : {}),
      ...(filters?.length ? { filters: JSON.stringify(filters) } : {}),
    },
  } as Href;
}
