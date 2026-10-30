import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ReaderChapterBoundary } from "@/components/reader/reader-chapter-boundary";
import {
  ReaderQuickActions,
  type ReaderQuickActionAnchor,
} from "@/components/reader/reader-quick-actions";
import { ReaderPageImage } from "@/components/reader/reader-page-image";
import { useReader } from "@/components/reader/reader-context";
import type { ChapterSegment } from "@/hooks/use-reader-chapter-window";
import {
  chapterTitleForDisplay,
  formatChapterLabel,
} from "@/utils/chapter-label";
import { findAdjacentChapter } from "@/utils/reader-chapters";
import { prefetchReaderPagesAhead } from "@/utils/reader-prefetch";
import {
  areReaderTapZonesEnabled,
  effectiveTapZoneGrid,
  tapActionAtPoint,
} from "@/utils/reader-tap-zones";
import type { Chapter } from "@/parsers/shared/types";
import { readerPageFrameHeight, type ReaderPage } from "@/utils/reader-pages";

type ReaderContextValue = ReturnType<typeof useReader>;

type StripPageItem = ReaderPage & {
  kind: "page";
  chapter: Chapter;
  localIndex: number;
};

type StripBreakItem = {
  kind: "break";
  id: string;
  previous: Chapter;
  next: Chapter;
};

type StripGhostItem = {
  kind: "ghost";
  id: string;
  chapter: Chapter;
  height: number;
};

type StripListItem = StripPageItem | StripBreakItem | StripGhostItem;

const CHAPTER_BREAK_HEIGHT = 280;
const PREVIOUS_REQUEST_GAP_MS = 400;
const EMPTY_GHOSTS: StripGhostItem[] = [];

type ReaderWebtoonViewProps = {
  onLocationChange: (
    chapter: Chapter,
    pageIndex: number,
    pageCount: number,
  ) => void;
  onInteraction: () => void;
  currentPage: number;
  setPageRef: (goToPage: (index: number, animated?: boolean) => void) => void;
};

function chapterLabel(chapter: Chapter): string {
  return chapterTitleForDisplay(chapter) || formatChapterLabel(chapter);
}

function isPageItem(item: StripListItem | undefined): item is StripPageItem {
  return item?.kind === "page";
}

function isNearListEnd(event: NativeScrollEvent, screens = 1.2): boolean {
  const viewport = Math.max(1, event.layoutMeasurement.height);
  const distance = event.contentSize.height - event.contentOffset.y - viewport;
  return distance <= viewport * screens;
}

function stripKeyExtractor(item: StripListItem): string {
  return item.id;
}

function reconcileGhosts(
  previous: ChapterSegment[],
  next: ChapterSegment[],
  existing: StripGhostItem[],
  heights: Record<string, number>,
  fallbackPageHeight: (page: ReaderPage) => number,
): StripGhostItem[] {
  if (previous === next) return existing;
  const nextKeys = new Set(next.map((segment) => segment.chapter.key));
  let result = existing.filter((ghost) => !nextKeys.has(ghost.chapter.key));
  let changed = result.length !== existing.length;
  const firstKept = previous.findIndex((segment) =>
    nextKeys.has(segment.chapter.key),
  );

  for (let index = 0; index < firstKept; index += 1) {
    const segment = previous[index]!;
    let height = 0;
    for (const page of segment.pages) {
      height += heights[page.id] ?? fallbackPageHeight(page);
    }
    const following = previous[index + 1];
    if (following) {
      height +=
        heights[`break:${segment.chapter.key}:${following.chapter.key}`] ??
        CHAPTER_BREAK_HEIGHT;
    }
    result = [
      ...result,
      {
        kind: "ghost",
        id: `ghost:${segment.chapter.key}`,
        chapter: segment.chapter,
        height,
      },
    ];
    changed = true;
  }

  return changed ? result : existing;
}

type PageCellProps = {
  item: StripPageItem;
  width: number;
  frameHeight: number;
  reloadKey: number;
  settings: ReaderContextValue["settings"];
  dictionarySettings: ReaderContextValue["dictionarySettings"];
  coverHeaders: ReaderContextValue["coverHeaders"];
  backgroundColor: string;
  onMeasured: (item: StripPageItem, ratio: number) => void;
  onSingleTap: (x: number, y: number) => void;
  onLongPressPage: (item: StripPageItem, x: number, y: number) => void;
  onLookup: (item: StripPageItem, x: number, y: number) => void;
};

const PageCell = memo(function PageCell({
  item,
  width,
  frameHeight,
  reloadKey,
  settings,
  dictionarySettings,
  coverHeaders,
  backgroundColor,
  onMeasured,
  onSingleTap,
  onLongPressPage,
  onLookup,
}: PageCellProps) {
  const frameStyle = useMemo(
    () => [styles.page, { width, height: frameHeight }],
    [width, frameHeight],
  );
  const handleMeasured = useCallback(
    (ratio: number) => onMeasured(item, ratio),
    [item, onMeasured],
  );
  const handleLongPress = useCallback(
    (x: number, y: number) => onLongPressPage(item, x, y),
    [item, onLongPressPage],
  );
  const handleLookup = useCallback(
    (x: number, y: number) => onLookup(item, x, y),
    [item, onLookup],
  );

  return (
    <View style={frameStyle} key={`${item.id}-${reloadKey}`}>
      <ReaderPageImage
        page={item}
        settings={settings}
        dictionarySettings={dictionarySettings}
        coverHeaders={coverHeaders}
        backgroundColor={backgroundColor}
        disableDoubleTap={settings.disableDoubleTap}
        pillarbox={settings.pillarbox}
        pillarboxAmount={settings.pillarboxAmount}
        pillarboxOrientation={settings.pillarboxOrientation}
        layout="intrinsic"
        containerWidth={width}
        onMeasuredAspectRatio={handleMeasured}
        onSingleTap={onSingleTap}
        onLongPress={handleLongPress}
        onDictionaryLookup={handleLookup}
      />
    </View>
  );
});

export function ReaderWebtoonView({
  onLocationChange,
  onInteraction,
  currentPage,
  setPageRef,
}: ReaderWebtoonViewProps) {
  const {
    pages,
    settings,
    dictionarySettings,
    mode,
    backgroundColor,
    foregroundColor,
    coverHeaders,
    actions,
    chapter,
    chapters,
    stripSegments,
    debugShowPageNumbers,
  } = useReader();
  const listRef = useRef<FlatList<StripListItem>>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tapGrid = useMemo(
    () => effectiveTapZoneGrid(settings, mode),
    [settings, mode],
  );
  const resumeIndexRef = useRef(currentPage);
  const restoringRef = useRef(currentPage > 0);
  const restoreDoneRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const visibleIndexRef = useRef(0);
  const visibleIdRef = useRef<string | null>(null);
  const prevStripItemsRef = useRef<StripListItem[]>([]);
  const lastTapAtRef = useRef(0);
  const userScrolledRef = useRef(false);
  const canLoadNextRef = useRef(false);
  const originChapterKeyRef = useRef(chapter.key);
  const lastPreviousRequestRef = useRef(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerHeightRef = useRef(0);
  const itemHeightsRef = useRef<Record<string, number>>({});
  const measuredIdsRef = useRef(new Set<string>());
  const pendingShiftRef = useRef(0);
  const [heightTick, setHeightTick] = useState(0);
  const heightFlushRef = useRef<number | null>(null);
  const lastOffsetYRef = useRef(0);
  const seekClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const estimatedHeight = Math.max(160, Math.round(height * 0.92));
  const contentWidth = Math.max(
    1,
    width -
      (settings.pillarbox && settings.pillarboxOrientation !== "vertical"
        ? Math.round(settings.pillarboxAmount) * 2
        : 0),
  );
  const [quickActionsPage, setQuickActionsPage] = useState<ReaderPage | null>(
    null,
  );
  const [quickActionsAnchor, setQuickActionsAnchor] =
    useState<ReaderQuickActionAnchor | null>(null);
  const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});

  const segments = useMemo(
    () =>
      (stripSegments.length > 0
        ? stripSegments
        : [{ chapter, pages }]) as ChapterSegment[],
    [chapter, pages, stripSegments],
  );

  const committedWindowRef = useRef<{
    segments: ChapterSegment[];
    ghosts: StripGhostItem[];
  }>({ segments, ghosts: EMPTY_GHOSTS });

  const fallbackPageHeight = useCallback(
    (page: ReaderPage) =>
      readerPageFrameHeight(page, contentWidth, undefined, estimatedHeight),
    [contentWidth, estimatedHeight],
  );

  const ghosts = useMemo(
    () =>
      reconcileGhosts(
        committedWindowRef.current.segments,
        segments,
        committedWindowRef.current.ghosts,
        itemHeightsRef.current,
        fallbackPageHeight,
      ),
    [segments, fallbackPageHeight],
  );

  const stripItems = useMemo(() => {
    const items: StripListItem[] = [...ghosts];
    segments.forEach((segment, segmentIndex) => {
      if (segmentIndex > 0) {
        const previous = segments[segmentIndex - 1]!.chapter;
        items.push({
          kind: "break",
          id: `break:${previous.key}:${segment.chapter.key}`,
          previous,
          next: segment.chapter,
        });
      }
      segment.pages.forEach((page, localIndex) => {
        items.push({
          ...page,
          kind: "page",
          chapter: segment.chapter,
          localIndex,
        });
      });
    });
    return items;
  }, [ghosts, segments]);

  const listEpochRef = useRef(0);
  const initialIndexRef = useRef<number | undefined>(undefined);
  const remountPendingRef = useRef(false);
  const epochGuardRef = useRef<StripListItem[] | null>(null);
  if (epochGuardRef.current !== stripItems) {
    const previousStrip = epochGuardRef.current;
    epochGuardRef.current = stripItems;
    const previousFirst = previousStrip?.[0]?.id;
    const movedFirst = previousFirst
      ? stripItems.findIndex((item) => item.id === previousFirst)
      : -1;
    if (previousStrip && previousStrip.length > 0 && movedFirst > 0) {
      const anchorIndex = visibleIdRef.current
        ? stripItems.findIndex((item) => item.id === visibleIdRef.current)
        : -1;
      listEpochRef.current += 1;
      initialIndexRef.current = anchorIndex >= 0 ? anchorIndex : movedFirst;
      remountPendingRef.current = true;
    }
  }
  const listEpoch = listEpochRef.current;

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({
        offset: info.index * info.averageItemLength,
        animated: false,
      });
    },
    [],
  );

  const stripItemsRef = useRef(stripItems);
  const segmentsRef = useRef(segments);
  const ghostsRef = useRef(ghosts);
  const onLocationChangeRef = useRef(onLocationChange);
  const actionsRef = useRef(actions);
  const coverHeadersRef = useRef(coverHeaders);
  const lastPrefetchIndexRef = useRef(-1);

  useLayoutEffect(() => {
    stripItemsRef.current = stripItems;
    segmentsRef.current = segments;
    ghostsRef.current = ghosts;
    committedWindowRef.current = { segments, ghosts };
    onLocationChangeRef.current = onLocationChange;
    actionsRef.current = actions;
    coverHeadersRef.current = coverHeaders;
  }, [stripItems, segments, ghosts, onLocationChange, actions, coverHeaders]);

  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];

  const bumpHeights = useCallback(() => {
    if (heightFlushRef.current != null) return;
    heightFlushRef.current = requestAnimationFrame(() => {
      heightFlushRef.current = null;
      setHeightTick((value) => value + 1);
    });
  }, []);

  const heightForItem = useCallback(
    (item: StripListItem | undefined) => {
      if (!item) return estimatedHeight;
      if (item.kind === "ghost") return item.height;
      const measured = itemHeightsRef.current[item.id];
      if (measured != null) return measured;
      if (item.kind === "break") return CHAPTER_BREAK_HEIGHT;
      return fallbackPageHeight(item);
    },
    [estimatedHeight, fallbackPageHeight],
  );

  const itemOffsetForIndex = useCallback(
    (index: number, items: StripListItem[]) => {
      let offset = 0;
      const limit = Math.max(0, Math.min(index, items.length));
      for (let i = 0; i < limit; i += 1) {
        offset += heightForItem(items[i]);
      }
      return offset;
    },
    [heightForItem],
  );

  const offsetForIndex = useCallback(
    (index: number, items: StripListItem[]) =>
      headerHeightRef.current + itemOffsetForIndex(index, items),
    [itemOffsetForIndex],
  );

  const indexForOffset = useCallback(
    (offsetY: number, items: StripListItem[]) => {
      if (items.length === 0) return 0;
      const target = offsetY + 32;
      let cursor = headerHeightRef.current;
      if (target <= cursor) return 0;
      for (let i = 0; i < items.length; i += 1) {
        const heightForCurrent = heightForItem(items[i]);
        if (target < cursor + heightForCurrent) return i;
        cursor += heightForCurrent;
      }
      return items.length - 1;
    },
    [heightForItem],
  );

  const layout = useMemo(() => {
    const offsets = new Array<number>(stripItems.length);
    const lengths = new Array<number>(stripItems.length);
    let acc = 0;
    for (let i = 0; i < stripItems.length; i += 1) {
      const length = heightForItem(stripItems[i]);
      offsets[i] = acc;
      lengths[i] = length;
      acc += length;
    }
    return { offsets, lengths };
  }, [stripItems, heightForItem, heightTick]);

  const getItemLayout = useCallback(
    (_: ArrayLike<StripListItem> | null | undefined, index: number) => ({
      length: layout.lengths[index] ?? estimatedHeight,
      offset: layout.offsets[index] ?? 0,
      index,
    }),
    [layout, estimatedHeight],
  );

  const applyItemHeight = useCallback(
    (id: string, nextHeight: number) => {
      if (nextHeight <= 0) return;
      measuredIdsRef.current.add(id);
      const prevHeight = itemHeightsRef.current[id];
      if (prevHeight != null && Math.abs(prevHeight - nextHeight) < 2) return;
      const items = stripItemsRef.current;
      const index = items.findIndex((item) => item.id === id);
      const offsetY = lastOffsetYRef.current;
      const start = index >= 0 ? offsetForIndex(index, items) : 0;
      itemHeightsRef.current[id] = nextHeight;
      if (
        prevHeight != null &&
        index >= 0 &&
        !programmaticScrollRef.current &&
        !restoringRef.current &&
        start + prevHeight <= offsetY + 1
      ) {
        pendingShiftRef.current += nextHeight - prevHeight;
      }
      bumpHeights();
    },
    [bumpHeights, offsetForIndex],
  );

  const pageCountForChapter = useCallback(
    (chapterKey: string, fallback: number) => {
      return (
        segmentsRef.current.find(
          (segment) => segment.chapter.key === chapterKey,
        )?.pages.length ?? fallback
      );
    },
    [],
  );

  const reportLocation = useCallback(
    (globalIndex: number) => {
      const item = stripItemsRef.current[globalIndex];
      if (!item || item.kind === "ghost") return;
      if (item.kind === "break") {
        if (
          !userScrolledRef.current &&
          item.next.key !== originChapterKeyRef.current
        )
          return;
        onLocationChangeRef.current(
          item.next,
          0,
          pageCountForChapter(item.next.key, 1),
        );
        return;
      }
      if (
        !userScrolledRef.current &&
        item.chapter.key !== originChapterKeyRef.current
      )
        return;
      onLocationChangeRef.current(
        item.chapter,
        item.localIndex,
        pageCountForChapter(item.chapter.key, item.localIndex + 1),
      );
    },
    [pageCountForChapter],
  );

  const shiftViewportBy = useCallback((delta: number) => {
    if (Math.abs(delta) < 1) return;
    const nextOffset = Math.max(0, lastOffsetYRef.current + delta);
    lastOffsetYRef.current = nextOffset;
    programmaticScrollRef.current = true;
    listRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
    if (seekClearTimerRef.current) clearTimeout(seekClearTimerRef.current);
    seekClearTimerRef.current = setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 80);
  }, []);

  const scrollToGlobal = useCallback(
    (index: number, animated: boolean) => {
      const items = stripItemsRef.current;
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      programmaticScrollRef.current = true;
      restoringRef.current = false;
      restoreDoneRef.current = true;
      visibleIndexRef.current = clamped;
      visibleIdRef.current = items[clamped]?.id ?? null;
      lastPrefetchIndexRef.current = clamped;
      prefetchReaderPagesAhead(
        items.map((item) => (item.kind === "page" ? item : {})),
        clamped,
        coverHeadersRef.current,
      );
      const offset = offsetForIndex(clamped, items);
      lastOffsetYRef.current = offset;
      listRef.current?.scrollToOffset({
        offset,
        animated,
      });
      if (seekClearTimerRef.current) clearTimeout(seekClearTimerRef.current);
      seekClearTimerRef.current = setTimeout(
        () => {
          programmaticScrollRef.current = false;
          const nextItems = stripItemsRef.current;
          const settled = indexForOffset(lastOffsetYRef.current, nextItems);
          visibleIndexRef.current = settled;
          visibleIdRef.current = nextItems[settled]?.id ?? null;
          reportLocation(settled);
        },
        animated ? 320 : 80,
      );
    },
    [indexForOffset, offsetForIndex, reportLocation],
  );

  const goToPage = useCallback(
    (localIndex: number, _animated = false) => {
      const items = stripItemsRef.current;
      const visible = items[visibleIndexRef.current];
      const chapterKey = isPageItem(visible)
        ? visible.chapter.key
        : visible?.kind === "break"
          ? visible.next.key
          : chapter.key;
      const global = items.findIndex(
        (item) =>
          item.kind === "page" &&
          item.chapter.key === chapterKey &&
          item.localIndex === localIndex,
      );
      if (global < 0) return;
      scrollToGlobal(global, false);
    },
    [chapter.key, scrollToGlobal],
  );

  useEffect(() => {
    setPageRef(goToPage);
  }, [goToPage, setPageRef]);

  useEffect(() => {
    return () => {
      if (heightFlushRef.current != null)
        cancelAnimationFrame(heightFlushRef.current);
      if (seekClearTimerRef.current) clearTimeout(seekClearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (restoreDoneRef.current) return;

    const tryRestore = () => {
      const items = stripItemsRef.current;
      if (items.length === 0) return false;
      const target = items.findIndex(
        (item) =>
          item.kind === "page" &&
          item.chapter.key === chapter.key &&
          item.localIndex === resumeIndexRef.current,
      );
      if (target < 0) return false;
      restoringRef.current = resumeIndexRef.current > 0;
      programmaticScrollRef.current = true;
      visibleIndexRef.current = target;
      visibleIdRef.current = items[target]?.id ?? null;
      const offset = offsetForIndex(target, items);
      lastOffsetYRef.current = offset;
      listRef.current?.scrollToOffset({ offset, animated: false });
      restoreDoneRef.current = true;
      return true;
    };

    const frame = requestAnimationFrame(() => {
      if (!tryRestore()) {
        requestAnimationFrame(() => {
          tryRestore();
        });
      }
    });
    const timer = setTimeout(() => {
      restoringRef.current = false;
      programmaticScrollRef.current = false;
      restoreDoneRef.current = true;
    }, 700);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [chapter.key, offsetForIndex]);

  useLayoutEffect(() => {
    const heights = itemHeightsRef.current;
    const previousItems = prevStripItemsRef.current;
    prevStripItemsRef.current = stripItems;

    const structureChanged =
      previousItems.length > 0 && previousItems[0]?.id !== stripItems[0]?.id;
    const offsetY = lastOffsetYRef.current;
    const canCompensate =
      !structureChanged &&
      !programmaticScrollRef.current &&
      !restoringRef.current;
    let cursor = headerHeightRef.current;
    let sizeShift = 0;
    let heightsChanged = false;

    for (const item of stripItems) {
      if (item.kind === "ghost") {
        cursor += item.height;
        continue;
      }
      const stored = heights[item.id];
      if (item.kind === "break") {
        if (stored == null) heights[item.id] = CHAPTER_BREAK_HEIGHT;
        cursor += heights[item.id]!;
        continue;
      }
      const computed = fallbackPageHeight(item);
      if (stored == null) {
        heights[item.id] = computed;
        cursor += computed;
        continue;
      }
      if (
        !measuredIdsRef.current.has(item.id) &&
        Math.abs(stored - computed) >= 1
      ) {
        if (canCompensate && cursor + stored <= offsetY + 1) {
          sizeShift += computed - stored;
        }
        heights[item.id] = computed;
        heightsChanged = true;
      }
      cursor += stored;
    }

    if (heightsChanged) {
      pendingShiftRef.current += sizeShift;
      bumpHeights();
    }

    const anchorId = visibleIdRef.current;
    if (anchorId) {
      const index = stripItems.findIndex((item) => item.id === anchorId);
      if (index >= 0) visibleIndexRef.current = index;
    }
    if (previousItems.length === 0 || previousItems === stripItems) return;

    if (remountPendingRef.current) {
      remountPendingRef.current = false;
      const target = initialIndexRef.current ?? 0;
      programmaticScrollRef.current = true;
      visibleIndexRef.current = target;
      visibleIdRef.current = stripItems[target]?.id ?? null;
      lastOffsetYRef.current = offsetForIndex(target, stripItems);
      if (seekClearTimerRef.current) clearTimeout(seekClearTimerRef.current);
      seekClearTimerRef.current = setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 500);
      return;
    }

    const newAnchorIndex = anchorId
      ? stripItems.findIndex((item) => item.id === anchorId)
      : -1;
    const oldAnchorIndex = anchorId
      ? previousItems.findIndex((item) => item.id === anchorId)
      : -1;
    if (newAnchorIndex >= 0 && oldAnchorIndex >= 0) {
      shiftViewportBy(
        offsetForIndex(newAnchorIndex, stripItems) -
          offsetForIndex(oldAnchorIndex, previousItems),
      );
      return;
    }

    const firstId = stripItems[0]?.id ?? null;
    if (!firstId) return;
    const newFirstInOld = previousItems.findIndex(
      (item) => item.id === firstId,
    );
    if (newFirstInOld > 0) {
      shiftViewportBy(-itemOffsetForIndex(newFirstInOld, previousItems));
      return;
    }
    const oldFirstInNew = stripItems.findIndex(
      (item) => item.id === previousItems[0]?.id,
    );
    if (oldFirstInNew > 0) {
      shiftViewportBy(itemOffsetForIndex(oldFirstInNew, stripItems));
    }
  }, [
    bumpHeights,
    fallbackPageHeight,
    itemOffsetForIndex,
    offsetForIndex,
    shiftViewportBy,
    stripItems,
  ]);

  useLayoutEffect(() => {
    const delta = pendingShiftRef.current;
    if (delta === 0) return;
    pendingShiftRef.current = 0;
    shiftViewportBy(delta);
  }, [heightTick, shiftViewportBy]);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const requestNextChapter = useCallback(() => {
    if (!settingsRef.current.verticalInfiniteScroll) return;
    if (!userScrolledRef.current || !canLoadNextRef.current) return;
    if (restoringRef.current || programmaticScrollRef.current) return;
    canLoadNextRef.current = false;
    actionsRef.current.loadAdjacentChapter("next");
  }, []);

  const requestPreviousNearGhosts = useCallback(
    (offsetY: number, viewport: number) => {
      const list = ghostsRef.current;
      if (list.length === 0 || !userScrolledRef.current) return;
      let zoneEnd = headerHeightRef.current;
      for (const ghost of list) zoneEnd += ghost.height;
      if (offsetY > zoneEnd + viewport) return;
      const now = Date.now();
      if (now - lastPreviousRequestRef.current < PREVIOUS_REQUEST_GAP_MS) {
        return;
      }
      lastPreviousRequestRef.current = now;
      actionsRef.current.loadAdjacentChapter("previous");
    },
    [],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nativeEvent = event.nativeEvent;
      const offsetY = nativeEvent.contentOffset.y;
      if (restoringRef.current || programmaticScrollRef.current) return;
      lastOffsetYRef.current = offsetY;
      const items = stripItemsRef.current;
      const index = indexForOffset(offsetY, items);
      visibleIndexRef.current = index;
      visibleIdRef.current = items[index]?.id ?? null;
      reportLocation(index);
      if (index !== lastPrefetchIndexRef.current) {
        lastPrefetchIndexRef.current = index;
        prefetchReaderPagesAhead(
          items.map((item) => (item.kind === "page" ? item : {})),
          index,
          coverHeadersRef.current,
        );
      }

      if (isNearListEnd(nativeEvent)) requestNextChapter();
      requestPreviousNearGhosts(offsetY, nativeEvent.layoutMeasurement.height);
    },
    [
      indexForOffset,
      reportLocation,
      requestNextChapter,
      requestPreviousNearGhosts,
    ],
  );

  const handleScrollSettled = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nativeEvent = event.nativeEvent;
      const skip = restoringRef.current || programmaticScrollRef.current;
      programmaticScrollRef.current = false;
      if (skip || !userScrolledRef.current) return;
      lastOffsetYRef.current = nativeEvent.contentOffset.y;
      if (nativeEvent.contentOffset.y <= headerHeightRef.current + 24) {
        actionsRef.current.loadAdjacentChapter("previous");
        return;
      }
      if (isNearListEnd(nativeEvent, 0.35)) requestNextChapter();
    },
    [requestNextChapter],
  );

  const handleTap = useCallback(
    (x: number, y: number) => {
      const now = Date.now();
      if (now - lastTapAtRef.current < 120) return;
      lastTapAtRef.current = now;
      const currentActions = actionsRef.current;
      if (settings.tapZones === "disabled" || !areReaderTapZonesEnabled(mode)) {
        currentActions.toggleBars();
        return;
      }
      const action = tapActionAtPoint(tapGrid, x, y, width, height);
      if (action === "toggleBars" || action === "none") {
        if (action === "toggleBars") currentActions.toggleBars();
        return;
      }
      onInteraction();
      const items = stripItemsRef.current;
      if (action === "next") {
        const next = visibleIndexRef.current + 1;
        if (next < items.length) {
          scrollToGlobal(next, settings.animatePageTransitions);
          return;
        }
        currentActions.loadAdjacentChapter("next");
        return;
      }
      if (action === "previous") {
        const previous = visibleIndexRef.current - 1;
        if (previous >= 0 && items[previous]?.kind !== "ghost") {
          scrollToGlobal(previous, settings.animatePageTransitions);
          return;
        }
        currentActions.loadAdjacentChapter("previous");
      }
    },
    [
      height,
      mode,
      onInteraction,
      scrollToGlobal,
      settings.animatePageTransitions,
      settings.tapZones,
      tapGrid,
      width,
    ],
  );

  const handleTapRef = useRef(handleTap);
  handleTapRef.current = handleTap;
  const stableTap = useCallback(
    (x: number, y: number) => handleTapRef.current(x, y),
    [],
  );
  const toggleBars = useCallback(() => actionsRef.current.toggleBars(), []);

  const handleScrollBegin = useCallback(() => {
    userScrolledRef.current = true;
    canLoadNextRef.current = true;
    programmaticScrollRef.current = false;
    restoringRef.current = false;
    restoreDoneRef.current = true;
    onInteraction();
  }, [onInteraction]);

  const handleMeasured = useCallback(
    (item: StripPageItem, ratio: number) => {
      applyItemHeight(
        item.id,
        readerPageFrameHeight(item, contentWidth, ratio, estimatedHeight),
      );
    },
    [applyItemHeight, contentWidth, estimatedHeight],
  );

  const handleLongPressPage = useCallback(
    (item: StripPageItem, x: number, y: number) => {
      if (
        settings.disableQuickActions ||
        dictionarySettings.lookupGesture === "long-press"
      )
        return;
      setQuickActionsPage(item);
      setQuickActionsAnchor({ x, y });
    },
    [dictionarySettings.lookupGesture, settings.disableQuickActions],
  );

  const handleLookup = useCallback(
    (item: StripPageItem, x: number, y: number) => {
      actionsRef.current.lookupDictionary(item.url ?? "", x, y, {
        width,
        height,
      });
    },
    [width, height],
  );

  const headerChapter = ghosts[0]?.chapter ?? firstSegment?.chapter;
  const firstChapterLabel = useMemo(
    () => (headerChapter ? chapterLabel(headerChapter) : ""),
    [headerChapter],
  );
  const lastChapterLabel = useMemo(
    () => (lastSegment ? chapterLabel(lastSegment.chapter) : ""),
    [lastSegment],
  );
  const nextAfterWindow = lastSegment
    ? findAdjacentChapter(
        chapters,
        lastSegment.chapter.key,
        "next",
        settings.skipDuplicateChapters,
      )
    : null;

  const handleHeaderLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const nextHeight = event.nativeEvent.layout.height;
      headerHeightRef.current = nextHeight;
      setHeaderHeight(nextHeight);
    },
    [],
  );

  const chapterStart = (
    <View onLayout={handleHeaderLayout}>
      <ReaderChapterBoundary
        kind="start"
        chapterLabel={firstChapterLabel}
        foregroundColor={foregroundColor}
        safeInset={insets.top}
        onPress={toggleBars}
      />
    </View>
  );

  const chapterEnd = nextAfterWindow ? (
    <View style={styles.nextFooter}>
      <ActivityIndicator color={foregroundColor} />
    </View>
  ) : (
    <ReaderChapterBoundary
      kind="end"
      chapterLabel={lastChapterLabel}
      nextChapterLabel={null}
      foregroundColor={foregroundColor}
      safeInset={insets.bottom}
      onPress={toggleBars}
    />
  );

  const renderItem = useCallback(
    ({ item }: { item: StripListItem }) => {
      if (item.kind === "ghost") {
        return <View style={{ height: item.height }} />;
      }

      if (item.kind === "break") {
        return (
          <View
            style={styles.chapterBreak}
            onLayout={(event) => {
              applyItemHeight(item.id, event.nativeEvent.layout.height);
            }}
          >
            <ReaderChapterBoundary
              kind="end"
              chapterLabel={chapterLabel(item.previous)}
              nextChapterLabel={chapterLabel(item.next)}
              foregroundColor={foregroundColor}
              onPress={toggleBars}
            />
            <ReaderChapterBoundary
              kind="start"
              chapterLabel={chapterLabel(item.next)}
              foregroundColor={foregroundColor}
              onPress={toggleBars}
            />
          </View>
        );
      }

      return (
        <PageCell
          item={item}
          width={width}
          frameHeight={heightForItem(item)}
          reloadKey={reloadKeys[item.id] ?? 0}
          settings={settings}
          dictionarySettings={dictionarySettings}
          coverHeaders={coverHeaders}
          backgroundColor={backgroundColor}
          onMeasured={handleMeasured}
          onSingleTap={stableTap}
          onLongPressPage={handleLongPressPage}
          onLookup={handleLookup}
        />
      );
    },
    [
      applyItemHeight,
      backgroundColor,
      coverHeaders,
      dictionarySettings,
      foregroundColor,
      handleLongPressPage,
      handleLookup,
      handleMeasured,
      heightForItem,
      reloadKeys,
      settings,
      stableTap,
      toggleBars,
      width,
    ],
  );

  const extraData = useMemo(
    () =>
      `${debugShowPageNumbers ? 1 : 0}:${stripItems.length}:${contentWidth}:${headerHeight}:${heightTick}:${ghosts.length}`,
    [
      debugShowPageNumbers,
      stripItems.length,
      contentWidth,
      headerHeight,
      heightTick,
      ghosts.length,
    ],
  );

  const handleCloseQuickActions = useCallback(() => {
    setQuickActionsPage(null);
    setQuickActionsAnchor(null);
  }, []);

  const handleReload = useCallback(() => {
    if (!quickActionsPage) return;
    setReloadKeys((current) => ({
      ...current,
      [quickActionsPage.id]: (current[quickActionsPage.id] ?? 0) + 1,
    }));
  }, [quickActionsPage]);

  const rootStyle = useMemo(
    () => [styles.root, { backgroundColor }],
    [backgroundColor],
  );

  return (
    <View style={rootStyle}>
      <FlatList
        key={`strip-${listEpoch}`}
        ref={listRef}
        data={stripItems}
        keyExtractor={stripKeyExtractor}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        pagingEnabled={false}
        decelerationRate={mode === "continuous" ? "normal" : "fast"}
        initialNumToRender={4}
        windowSize={7}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS === "android"}
        initialScrollIndex={listEpoch > 0 ? initialIndexRef.current : undefined}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        extraData={extraData}
        getItemLayout={getItemLayout}
        ListHeaderComponent={chapterStart}
        ListFooterComponent={chapterEnd}
        scrollEventThrottle={16}
        {...(Platform.OS === "ios" && settings.liveText
          ? ({ delaysContentTouches: false } as object)
          : {})}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBegin}
        onScrollEndDrag={handleScrollSettled}
        onMomentumScrollEnd={handleScrollSettled}
        onEndReached={requestNextChapter}
        onEndReachedThreshold={1}
        renderItem={renderItem}
      />
      <ReaderQuickActions
        visible={quickActionsPage != null}
        page={quickActionsPage}
        anchor={quickActionsAnchor}
        onClose={handleCloseQuickActions}
        onReload={handleReload}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 32,
  },
  page: {
    width: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
  },
  chapterBreak: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  nextFooter: {
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
});
