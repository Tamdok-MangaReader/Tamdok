import type { Manga } from '@/parsers/shared/types';

export function resolveMangaPageUrl(manga: Manga, sourceBaseUrl?: string): string | undefined {
  if (manga.url) return manga.url;

  const key = manga.key;
  if (/^https?:\/\//i.test(key)) return key;

  if (!sourceBaseUrl) return undefined;

  try {
    const base = sourceBaseUrl.endsWith('/') ? sourceBaseUrl : `${sourceBaseUrl}/`;
    return new URL(key.startsWith('/') ? key.slice(1) : key, base).href;
  } catch {
    return undefined;
  }
}
