import type { Chapter } from '@/parsers/shared/types';

export type AdjacentChapterResult = {
  chapter: Chapter | null;
  skippedDuplicates: Chapter[];
};

export function findAdjacentChapterWithSkipped(
  chapters: Chapter[],
  currentKey: string,
  direction: 'next' | 'previous',
  skipDuplicates: boolean,
): AdjacentChapterResult {
  if (chapters.length === 0) return { chapter: null, skippedDuplicates: [] };

  const ascending = [...chapters].reverse();
  const index = ascending.findIndex((chapter) => chapter.key === currentKey);
  if (index < 0) return { chapter: null, skippedDuplicates: [] };

  const current = ascending[index]!;
  const step = direction === 'next' ? 1 : -1;
  const skippedDuplicates: Chapter[] = [];
  let cursor = index + step;
  let fallback: Chapter | null = null;

  while (cursor >= 0 && cursor < ascending.length) {
    const candidate = ascending[cursor]!;
    const duplicate = isDuplicateChapter(current, candidate);

    if (!duplicate) {
      return { chapter: candidate, skippedDuplicates };
    }

    if (!fallback) fallback = candidate;
    skippedDuplicates.push(candidate);

    if (!skipDuplicates) {
      return { chapter: fallback, skippedDuplicates };
    }

    cursor += step;
  }

  return { chapter: null, skippedDuplicates };
}

export function findAdjacentChapter(
  chapters: Chapter[],
  currentKey: string,
  direction: 'next' | 'previous',
  skipDuplicates: boolean,
): Chapter | null {
  return findAdjacentChapterWithSkipped(chapters, currentKey, direction, skipDuplicates).chapter;
}

function isDuplicateChapter(current: Chapter, candidate: Chapter): boolean {
  if (current.key === candidate.key) return true;
  if (current.chapterNumber != null && candidate.chapterNumber != null) {
    return current.chapterNumber === candidate.chapterNumber;
  }
  if (current.title && candidate.title) {
    return normalizeTitle(current.title) === normalizeTitle(candidate.title);
  }
  return false;
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}
