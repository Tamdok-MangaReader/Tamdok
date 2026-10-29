import { useCallback, useEffect, useRef, useState } from "react";

import type { Chapter, Page } from "@/parsers/shared/types";
import type { ReaderSettings } from "@/services/app-settings";
import { findAdjacentChapter } from "@/utils/reader-chapters";
import { materializeReaderPages, type ReaderPage } from "@/utils/reader-pages";

export type ChapterSegment = {
  chapter: Chapter;
  pages: ReaderPage[];
};

type Direction = "previous" | "next";

type UseReaderChapterWindowOptions = {
  enabled: boolean;
  routeChapter: Chapter;
  activeChapterKey?: string;
  chapters: Chapter[];
  initialPages: ReaderPage[];
  settings: ReaderSettings | null;
  skipDuplicates: boolean;
  loadChapterPages?: (chapter: Chapter) => Promise<Page[]>;
  requestHeaders?: Record<string, string>;
};

const MAX_SEGMENTS = 3;
const MIN_DISTANCE_TO_DROP = 2;
const RETRY_COOLDOWN_MS = 8000;

function samePages(a: ReaderPage[], b: ReaderPage[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  try {
    for (let i = 0; i < a.length; i += 1) {
      const left = a[i]!;
      const right = b[i]!;
      if (left !== right && JSON.stringify(left) !== JSON.stringify(right))
        return false;
    }
  } catch {
    return false;
  }
  return true;
}

function trimSegments(
  segments: ChapterSegment[],
  direction: Direction,
  activeKey: string | undefined,
  addedKey: string,
): ChapterSegment[] {
  let result = segments;
  while (result.length > MAX_SEGMENTS) {
    const activeIndex = activeKey
      ? result.findIndex((segment) => segment.chapter.key === activeKey)
      : -1;
    if (activeIndex < 0) {
      result = direction === "previous" ? result.slice(0, -1) : result.slice(1);
      continue;
    }
    const headDistance = activeIndex;
    const tailDistance = result.length - 1 - activeIndex;
    const canDropHead =
      headDistance >= MIN_DISTANCE_TO_DROP &&
      result[0]!.chapter.key !== addedKey;
    const canDropTail =
      tailDistance >= MIN_DISTANCE_TO_DROP &&
      result[result.length - 1]!.chapter.key !== addedKey;
    if (canDropHead && (!canDropTail || headDistance >= tailDistance)) {
      result = result.slice(1);
    } else if (canDropTail) {
      result = result.slice(0, -1);
    } else {
      break;
    }
  }
  return result;
}

export function useReaderChapterWindow({
  enabled,
  routeChapter,
  activeChapterKey,
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
  const activeKeyRef = useRef(activeChapterKey);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const failedRef = useRef(new Map<string, number>());
  segmentsRef.current = segments;
  activeKeyRef.current = activeChapterKey;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (routeKeyRef.current !== routeChapter.key) {
      routeKeyRef.current = routeChapter.key;
      generationRef.current += 1;
      failedRef.current.clear();
      loadingRef.current = { previous: false, next: false };
      setLoadingPrevious(false);
      setLoadingNext(false);
      setSegments([{ chapter: routeChapter, pages: initialPages }]);
      return;
    }

    setSegments((current) => {
      if (current.length === 0)
        return [{ chapter: routeChapter, pages: initialPages }];
      let changed = false;
      const next = current.map((segment) => {
        if (segment.chapter.key !== routeChapter.key) return segment;
        const pages = samePages(segment.pages, initialPages)
          ? segment.pages
          : initialPages;
        if (pages === segment.pages && segment.chapter === routeChapter)
          return segment;
        changed = true;
        return { chapter: routeChapter, pages };
      });
      return changed ? next : current;
    });
  }, [initialPages, routeChapter]);

  const loadAdjacent = useCallback(
    async (direction: Direction) => {
      if (!enabled || !settings || !loadChapterPages) return;
      if (loadingRef.current[direction]) return;

      const current = segmentsRef.current;
      const edge =
        direction === "previous" ? current[0] : current[current.length - 1];
      if (!edge) return;

      const adjacent = findAdjacentChapter(
        chapters,
        edge.chapter.key,
        direction,
        skipDuplicates,
      );
      if (
        !adjacent ||
        current.some((segment) => segment.chapter.key === adjacent.key)
      )
        return;

      const failedAt = failedRef.current.get(adjacent.key);
      if (failedAt !== undefined && Date.now() - failedAt < RETRY_COOLDOWN_MS)
        return;

      const generation = generationRef.current;
      loadingRef.current[direction] = true;
      if (direction === "previous") setLoadingPrevious(true);
      else setLoadingNext(true);

      try {
        const rawPages = await loadChapterPages(adjacent);
        const pages = await materializeReaderPages(
          rawPages,
          settings,
          adjacent.key,
          requestHeaders,
          "headers",
        );
        if (!mountedRef.current || generation !== generationRef.current) return;
        if (pages.length === 0) {
          failedRef.current.set(adjacent.key, Date.now());
          return;
        }
        failedRef.current.delete(adjacent.key);

        setSegments((existing) => {
          if (existing.some((segment) => segment.chapter.key === adjacent.key))
            return existing;
          const nextSegment = { chapter: adjacent, pages };
          const merged =
            direction === "previous"
              ? [nextSegment, ...existing]
              : [...existing, nextSegment];
          return trimSegments(
            merged,
            direction,
            activeKeyRef.current,
            adjacent.key,
          );
        });
      } catch {
        if (generation === generationRef.current)
          failedRef.current.set(adjacent.key, Date.now());
      } finally {
        if (generation === generationRef.current) {
          loadingRef.current[direction] = false;
          if (mountedRef.current) {
            if (direction === "previous") setLoadingPrevious(false);
            else setLoadingNext(false);
          }
        }
      }
    },
    [
      chapters,
      enabled,
      loadChapterPages,
      requestHeaders,
      settings,
      skipDuplicates,
    ],
  );

  return { segments, loadAdjacent, loadingPrevious, loadingNext };
}
