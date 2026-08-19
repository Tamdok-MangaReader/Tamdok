import type { Chapter, Manga } from '@/parsers/shared/types';
import { decodeMangaKey } from '@/utils/manga-route';

export function chaptersOldestFirst(chapters: Chapter[]): Chapter[] {
  const numbered = chapters.filter((chapter) => chapter.chapterNumber != null).length;
  if (numbered === chapters.length && chapters.length > 0) {
    return [...chapters].sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
  }
  return [...chapters].reverse();
}

export function formatChapterLabel(chapter: Chapter): string {
  if (chapter.chapterNumber != null) {
    return `Ch. ${chapter.chapterNumber}`;
  }
  if (chapter.title?.trim()) {
    return chapter.title;
  }
  return decodeMangaKey(chapter.key);
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
