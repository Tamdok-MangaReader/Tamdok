import { useCallback, useEffect, useRef, useState } from 'react';

import type { Chapter, Page } from '@/parsers/shared/types';
import type { ReaderSettings } from '@/services/app-settings';
import { findAdjacentChapter } from '@/utils/reader-chapters';
import { materializeReaderPages, type ReaderPage } from '@/utils/reader-pages';

export type ChapterSegment = {
  chapter: Chapter;
  pages: ReaderPage[];
};

type UseReaderChapterWindowOptions = {
  enabled: boolean;
  routeChapter: Chapter;
  chapters: Chapter[];
  initialPages: ReaderPage[];
  settings: ReaderSettings | null;
  skipDuplicates: boolean;
  loadChapterPages?: (chapter: Chapter) => Promise<Page[]>;
  requestHeaders?: Record<string, string>;
};

// Keeps prev/next chapter pages in memory for continuous vertical reading.
export function useReaderChapterWindow({
  enabled,
  routeChapter,
  chapters,
  initialPages,
  settings,
  skipDuplicates,
  loadChapterPages,
  requestHeaders,
}: UseReaderChapterWindowOptions) {
  const [segments, setSegments] = useState<ChapterSegment[]>(() => [
    { chapter: routeChapter, pages: initialPages },
  ]);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const segmentsRef = useRef(segments);
  const loadingRef = useRef({ previous: false, next: false });
  const routeKeyRef = useRef(routeChapter.key);
  segmentsRef.current = segments;

  useEffect(() => {
    if (routeKeyRef.current !== routeChapter.key) {
      routeKeyRef.current = routeChapter.key;
      setSegments([{ chapter: routeChapter, pages: initialPages }]);
      return;
    }

    setSegments((current) => {
      if (current.length === 0) return [{ chapter: routeChapter, pages: initialPages }];
      return current.map((segment) =>
        segment.chapter.key === routeChapter.key ? { chapter: routeChapter, pages: initialPages } : segment,
      );
    });
  }, [initialPages, routeChapter]);

  const loadAdjacent = useCallback(
    async (direction: 'previous' | 'next') => {
      if (!enabled || !settings || !loadChapterPages) return;
      if (direction === 'previous' && loadingRef.current.previous) return;
      if (direction === 'next' && loadingRef.current.next) return;

      const current = segmentsRef.current;
      const edge = direction === 'previous' ? current[0] : current[current.length - 1];
      if (!edge) return;

      const adjacent = findAdjacentChapter(chapters, edge.chapter.key, direction, skipDuplicates);
      if (!adjacent || current.some((segment) => segment.chapter.key === adjacent.key)) return;

      loadingRef.current[direction] = true;
      if (direction === 'previous') setLoadingPrevious(true);
      else setLoadingNext(true);

      try {
        const rawPages = await loadChapterPages(adjacent);
        const pages = await materializeReaderPages(rawPages, settings, adjacent.key, requestHeaders, 'headers');
        if (pages.length === 0) return;

        setSegments((existing) => {
          if (existing.some((segment) => segment.chapter.key === adjacent.key)) return existing;
          const nextSegment = { chapter: adjacent, pages };
          const merged = direction === 'previous' ? [nextSegment, ...existing] : [...existing, nextSegment];
          // Keep only prev/current/next decoded chapter windows in JS + native views.
          if (merged.length <= 3) return merged;
          return direction === 'previous' ? merged.slice(0, 3) : merged.slice(-3);
        });
      } catch {
        // Adjacent chapters are best-effort.
      } finally {
        loadingRef.current[direction] = false;
        if (direction === 'previous') setLoadingPrevious(false);
        else setLoadingNext(false);
      }
    },
    [chapters, enabled, loadChapterPages, requestHeaders, settings, skipDuplicates],
  );

  return { segments, loadAdjacent, loadingPrevious, loadingNext };
}
