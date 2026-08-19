import type { Chapter, Manga, MangaPageResult } from './types';

export function normalizeMangaPageResult(result: MangaPageResult): MangaPageResult {
  return {
    entries: result.entries.map(normalizeManga),
    hasNextPage: Boolean(result.hasNextPage),
  };
}

export function normalizeManga(manga: Manga): Manga {
  return {
    ...manga,
    chapters: manga.chapters?.map(normalizeChapter),
  };
}

export function normalizeChapter(chapter: Chapter): Chapter {
  const raw = chapter as Chapter & {
    chapter_number?: number;
    volume_number?: number;
    date_uploaded?: number;
  };
  return {
    ...chapter,
    chapterNumber: chapter.chapterNumber ?? raw.chapter_number,
    volumeNumber: chapter.volumeNumber ?? raw.volume_number,
    dateUploaded: chapter.dateUploaded ?? raw.date_uploaded,
  };
}
