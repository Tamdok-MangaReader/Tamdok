import type { Chapter, Manga } from '@/parsers/shared/types';
import { t } from '@/constants/locales';
import { decodeMangaKey } from '@/utils/manga-route';
import { formatChapterNumberValue, looksLikeOpaqueChapterId, sanitizeChapterDisplayText, sanitizeChapterTitle } from '@/parsers/shared/chapter-number';

export {
  formatChapterNumberValue,
  looksLikeOpaqueChapterId,
  sanitizeChapterNumber,
  sanitizeChapterDisplayText,
  sanitizeChapterTitle,
} from '@/parsers/shared/chapter-number';

export function chaptersOldestFirst(chapters: Chapter[]): Chapter[] {
  const numbered = chapters.filter((chapter) => chapter.chapterNumber != null).length;
  if (numbered === chapters.length && chapters.length > 0) {
    return [...chapters].sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
  }
  return [...chapters].reverse();
}

export function chapterTitleForDisplay(chapter: Chapter): string | undefined {
  return sanitizeChapterTitle(chapter.title);
}

export function formatChapterLabel(chapter: Chapter, ordinal?: number): string {
  if (chapter.chapterNumber != null) {
    return `Ch. ${formatChapterNumberValue(chapter.chapterNumber)}`;
  }
  const title = chapterTitleForDisplay(chapter);
  if (title) return title;
  const fromKey = sanitizeChapterDisplayText(decodeMangaKey(chapter.key));
  if (fromKey && !looksLikeOpaqueChapterId(fromKey)) return fromKey;
  if (ordinal != null && ordinal > 0) return `Ch. ${ordinal}`;
  return t('history_unknown_chapter');
}

export function formatStoredChapterLabel(title?: string | null, key?: string | null): string | undefined {
  const fromTitle = sanitizeChapterTitle(title);
  if (fromTitle) return fromTitle;
  if (!key) return undefined;
  const fromKey = sanitizeChapterDisplayText(decodeMangaKey(key));
  if (fromKey && !looksLikeOpaqueChapterId(fromKey)) return fromKey;
  return undefined;
}

export function formatEntryChapterLabel(chapter: Chapter | undefined, storedTitle?: string | null, storedKey?: string | null, ordinal?: number): string {
  if (chapter) return formatChapterLabel(chapter, ordinal);
  return formatStoredChapterLabel(storedTitle, storedKey) ?? t('history_unknown_chapter');
}

/** Same chapter resolution as vertical home sections: explicit chapter, else first attached chapter. */
export function resolveHomeChapter(manga: Manga, chapter?: Chapter): Chapter | undefined {
  return chapter ?? manga.chapters?.[0];
}

export function homeChapterLabel(manga: Manga, chapter?: Chapter): string | null {
  const resolved = resolveHomeChapter(manga, chapter);
  return resolved ? formatChapterLabel(resolved) : null;
}

export function withLatestChapterOnly(manga: Manga): Manga {
  const chapters = manga.chapters;
  if (!chapters?.length) return manga;

  const sorted = [...chapters].sort((a, b) => (b.chapterNumber ?? 0) - (a.chapterNumber ?? 0));
  const latest = sorted[0];
  if (!latest) return manga;

  return { ...manga, chapters: [latest] };
}
