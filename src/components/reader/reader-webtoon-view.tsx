import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReaderChapterBoundary } from '@/components/reader/reader-chapter-boundary';
import { ReaderQuickActions, type ReaderQuickActionAnchor } from '@/components/reader/reader-quick-actions';
import { ReaderPageImage } from '@/components/reader/reader-page-image';
import { useReader } from '@/components/reader/reader-context';
import { chapterTitleForDisplay, formatChapterLabel } from '@/utils/chapter-label';
import { findAdjacentChapter } from '@/utils/reader-chapters';
import { prefetchReaderPagesAhead } from '@/utils/reader-prefetch';
import { effectiveTapZoneGrid, tapActionAtPoint } from '@/utils/reader-tap-zones';
import type { Chapter } from '@/parsers/shared/types';
import { readerPageFrameHeight, type ReaderPage } from '@/utils/reader-pages';

type StripPageItem = ReaderPage & {
  kind: 'page';
  chapter: Chapter;
  localIndex: number;
};

type StripBreakItem = {
  kind: 'break';
  id: string;
  previous: Chapter;
  next: Chapter;
};

type StripListItem = StripPageItem | StripBreakItem;

const CHAPTER_BREAK_HEIGHT = 280;

type ReaderWebtoonViewProps = {
  onLocationChange: (chapter: Chapter, pageIndex: number, pageCount: number) => void;
  onInteraction: () => void;
  currentPage: number;
  setPageRef: (goToPage: (index: number, animated?: boolean) => void) => void;
};

function chapterLabel(chapter: Chapter): string {
  return chapterTitleForDisplay(chapter) || formatChapterLabel(chapter);
}

function isPageItem(item: StripListItem | undefined): item is StripPageItem {
  return item?.kind === 'page';
}

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
  const tapGrid = useMemo(() => effectiveTapZoneGrid(settings, mode), [settings, mode]);
  const resumeIndexRef = useRef(currentPage);
  const restoringRef = useRef(currentPage > 0);
  const restoreDoneRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const visibleIndexRef = useRef(0);
  const visibleIdRef = useRef<string | null>(null);
  const prevFirstIdRef = useRef<string | null>(null);
  const lastTapAtRef = useRef(0);
  const userScrolledRef = useRef(false);
  const originChapterKeyRef = useRef(chapter.key);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerHeightRef = useRef(0);
  headerHeightRef.current = headerHeight;
  const itemHeightsRef = useRef<Record<string, number>>({});
  const [heightTick, setHeightTick] = useState(0);
  const heightFlushRef = useRef<number | null>(null);
  const lastOffsetYRef = useRef(0);
  const seekClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const estimatedHeight = Math.max(160, Math.round(height * 0.92));
  const contentWidth = Math.max(
    1,
    width -
      (settings.pillarbox && settings.pillarboxOrientation !== 'vertical'
        ? Math.round(settings.pillarboxAmount) * 2
        : 0),
  );
  const [quickActionsPage, setQuickActionsPage] = useState<ReaderPage | null>(null);
  const [quickActionsAnchor, setQuickActionsAnchor] = useState<ReaderQuickActionAnchor | null>(null);
  const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});

  const segments = useMemo(
    () => (stripSegments.length > 0 ? stripSegments : [{ chapter, pages }]),
    [chapter, pages, stripSegments],
  );
  const stripItems = useMemo(() => {
    const items: StripListItem[] = [];
    // Flatten chapter window into one list with dividers between loaded segments.
    segments.forEach((segment, segmentIndex) => {
      if (segmentIndex > 0) {
        const previous = segments[segmentIndex - 1]!.chapter;
        items.push({
          kind: 'break',
          id: `break:${previous.key}:${segment.chapter.key}`,
          previous,
          next: segment.chapter,
        });
      }
      segment.pages.forEach((page, localIndex) => {
        items.push({ ...page, kind: 'page', chapter: segment.chapter, localIndex });
      });
    });
    return items;
  }, [segments]);

  const stripItemsRef = useRef(stripItems);
  const segmentsRef = useRef(segments);
  const onLocationChangeRef = useRef(onLocationChange);
  const actionsRef = useRef(actions);
  stripItemsRef.current = stripItems;
  segmentsRef.current = segments;
  onLocationChangeRef.current = onLocationChange;
  actionsRef.current = actions;
  const coverHeadersRef = useRef(coverHeaders);
  coverHeadersRef.current = coverHeaders;
  const lastPrefetchIndexRef = useRef(-1);

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
      const measured = itemHeightsRef.current[item.id];
      if (measured != null) return measured;
      if (item.kind === 'break') return CHAPTER_BREAK_HEIGHT;
      return readerPageFrameHeight(item, contentWidth, undefined, estimatedHeight);
    },
    [contentWidth, estimatedHeight],
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
    (index: number, items: StripListItem[]) => headerHeightRef.current + itemOffsetForIndex(index, items),
    [itemOffsetForIndex],
  );

  const indexForOffset = useCallback(
    (offsetY: number, items: StripListItem[]) => {
      if (items.length === 0) return 0;
      // Small lookahead keeps the visible page from flipping too early while scrolling.
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

  const applyItemHeight = useCallback(
    (id: string, nextHeight: number) => {
      if (nextHeight <= 0) return;
      const prevHeight = itemHeightsRef.current[id];
      if (prevHeight != null && Math.abs(prevHeight - nextHeight) < 2) return;
      const items = stripItemsRef.current;
      const index = items.findIndex((item) => item.id === id);
      const offsetY = lastOffsetYRef.current;
      const start = index >= 0 ? offsetForIndex(index, items) : 0;
      itemHeightsRef.current[id] = nextHeight;
      bumpHeights();
      if (prevHeight == null || index < 0 || programmaticScrollRef.current || restoringRef.current) {
        return;
      }
      if (start + prevHeight <= offsetY + 1) {
        const nextOffset = Math.max(0, offsetY + (nextHeight - prevHeight));
        lastOffsetYRef.current = nextOffset;
        listRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
      }
    },
    [bumpHeights, offsetForIndex],
  );

  const pageCountForChapter = useCallback((chapterKey: string, fallback: number) => {
    return segmentsRef.current.find((segment) => segment.chapter.key === chapterKey)?.pages.length ?? fallback;
  }, []);

  const reportLocation = useCallback(
    (globalIndex: number) => {
      const item = stripItemsRef.current[globalIndex];
      if (!item) return;
      if (item.kind === 'break') {
        if (!userScrolledRef.current && item.next.key !== originChapterKeyRef.current) return;
        onLocationChangeRef.current(item.next, 0, pageCountForChapter(item.next.key, 1));
        return;
      }
      if (!userScrolledRef.current && item.chapter.key !== originChapterKeyRef.current) return;
      onLocationChangeRef.current(item.chapter, item.localIndex, pageCountForChapter(item.chapter.key, item.localIndex + 1));
    },
    [pageCountForChapter],
  );

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
        items.map((item) => (item.kind === 'page' ? item : {})),
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
        : visible?.kind === 'break'
          ? visible.next.key
          : chapter.key;
      const global = items.findIndex(
        (item) => item.kind === 'page' && item.chapter.key === chapterKey && item.localIndex === localIndex,
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
      if (heightFlushRef.current != null) cancelAnimationFrame(heightFlushRef.current);
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
          item.kind === 'page' && item.chapter.key === chapter.key && item.localIndex === resumeIndexRef.current,
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
    for (const item of stripItems) {
      if (itemHeightsRef.current[item.id] != null) continue;
      itemHeightsRef.current[item.id] =
        item.kind === 'break'
          ? CHAPTER_BREAK_HEIGHT
          : readerPageFrameHeight(item, contentWidth, undefined, estimatedHeight);
    }

    const firstId = stripItems[0]?.id ?? null;
    const previousFirst = prevFirstIdRef.current;
    prevFirstIdRef.current = firstId;
    const anchorId = visibleIdRef.current;
    if (anchorId) {
      const index = stripItems.findIndex((item) => item.id === anchorId);
      if (index >= 0) visibleIndexRef.current = index;
    }
    if (!previousFirst || !firstId || previousFirst === firstId) return;

    let extra = 0;
    for (const item of stripItems) {
      if (item.id === previousFirst) break;
      extra += heightForItem(item);
    }
    if (extra <= 0) return;

    const nextOffset = lastOffsetYRef.current + extra;
    lastOffsetYRef.current = nextOffset;
    programmaticScrollRef.current = true;
    listRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
    if (seekClearTimerRef.current) clearTimeout(seekClearTimerRef.current);
    seekClearTimerRef.current = setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 80);
  }, [contentWidth, estimatedHeight, heightForItem, stripItems]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      lastOffsetYRef.current = offsetY;
      if (restoringRef.current || programmaticScrollRef.current) return;
      const items = stripItemsRef.current;
      const index = indexForOffset(offsetY, items);
      visibleIndexRef.current = index;
      visibleIdRef.current = items[index]?.id ?? null;
      reportLocation(index);
      if (index !== lastPrefetchIndexRef.current) {
        lastPrefetchIndexRef.current = index;
        prefetchReaderPagesAhead(
          items.map((item) => (item.kind === 'page' ? item : {})),
          index,
          coverHeadersRef.current,
        );
      }

      if (!userScrolledRef.current) return;
      const item = items[index];
      if (!item) return;
      const last = segmentsRef.current[segmentsRef.current.length - 1];
      if (isPageItem(item) && last && item.chapter.key === last.chapter.key && item.localIndex >= last.pages.length - 2) {
        actionsRef.current.loadAdjacentChapter('next');
      }
    },
    [indexForOffset, reportLocation],
  );

  const handleScrollSettled = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    lastOffsetYRef.current = offsetY;
    const skip = restoringRef.current || programmaticScrollRef.current;
    programmaticScrollRef.current = false;
    if (skip || !userScrolledRef.current) return;
    if (offsetY > headerHeightRef.current + 24) return;
    actionsRef.current.loadAdjacentChapter('previous');
  }, []);

  const handleTap = useCallback(
    (x: number, y: number) => {
      const now = Date.now();
      if (now - lastTapAtRef.current < 120) return;
      lastTapAtRef.current = now;
      if (settings.tapZones === 'disabled') {
        actions.toggleBars();
        return;
      }
      const action = tapActionAtPoint(tapGrid, x, y, width, height);
      if (action === 'toggleBars' || action === 'none') {
        if (action === 'toggleBars') actions.toggleBars();
        return;
      }
      onInteraction();
      if (action === 'next') {
        const next = visibleIndexRef.current + 1;
        if (next < stripItems.length) {
          scrollToGlobal(next, settings.animatePageTransitions);
          return;
        }
        actions.loadAdjacentChapter('next');
        return;
      }
      if (action === 'previous') {
        const previous = visibleIndexRef.current - 1;
        if (previous >= 0) {
          scrollToGlobal(previous, settings.animatePageTransitions);
          return;
        }
        actions.loadAdjacentChapter('previous');
      }
    },
    [
      actions,
      height,
      mode,
      onInteraction,
      scrollToGlobal,
      settings.animatePageTransitions,
      settings.tapZones,
      stripItems.length,
      tapGrid,
      width,
    ],
  );

  const handleScrollBegin = useCallback(() => {
    userScrolledRef.current = true;
    programmaticScrollRef.current = false;
    restoringRef.current = false;
    restoreDoneRef.current = true;
    onInteraction();
  }, [onInteraction]);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((x: number, y: number) => {
    touchStartRef.current = { x, y, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback(
    (x: number, y: number) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const dt = Date.now() - start.time;
      const dist = Math.hypot(x - start.x, y - start.y);
      if (dt > 280 || dist > 14) return;
      handleTap(x, y);
    },
    [handleTap],
  );

  const firstChapterLabel = useMemo(
    () => (firstSegment ? chapterLabel(firstSegment.chapter) : ''),
    [firstSegment],
  );
  const lastChapterLabel = useMemo(
    () => (lastSegment ? chapterLabel(lastSegment.chapter) : ''),
    [lastSegment],
  );
  const nextAfterWindow = lastSegment
    ? findAdjacentChapter(chapters, lastSegment.chapter.key, 'next', settings.skipDuplicateChapters)
    : null;

  const chapterStart = (
    <View
      onLayout={(event) => {
        const nextHeight = event.nativeEvent.layout.height;
        headerHeightRef.current = nextHeight;
        setHeaderHeight(nextHeight);
      }}>
      <ReaderChapterBoundary
        kind='start'
        chapterLabel={firstChapterLabel}
        foregroundColor={foregroundColor}
        safeInset={insets.top}
        onPress={actions.toggleBars}
      />
    </View>
  );

  const chapterEnd = nextAfterWindow ? null : (
    <ReaderChapterBoundary
      kind='end'
      chapterLabel={lastChapterLabel}
      nextChapterLabel={null}
      foregroundColor={foregroundColor}
      safeInset={insets.bottom}
      onPress={actions.toggleBars}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <FlatList
        ref={listRef}
        data={stripItems}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        pagingEnabled={false}
        decelerationRate={mode === 'continuous' ? 'normal' : 'fast'}
        initialNumToRender={Math.max(4, settings.pagesToPreload)}
        windowSize={Math.max(11, settings.pagesToPreload + 8)}
        maxToRenderPerBatch={6}
        removeClippedSubviews={false}
        extraData={`${debugShowPageNumbers ? 1 : 0}:${stripItems.length}:${contentWidth}:${headerHeight}:${heightTick}`}
        getItemLayout={(_, index) => ({
          length: heightForItem(stripItems[index]),
          offset: itemOffsetForIndex(index, stripItems),
          index,
        })}
        ListHeaderComponent={chapterStart}
        ListFooterComponent={chapterEnd}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBegin}
        onScrollEndDrag={handleScrollSettled}
        onMomentumScrollEnd={handleScrollSettled}
        onTouchStart={(event) => {
          const touch = event.nativeEvent.touches[0];
          if (touch) handleTouchStart(touch.pageX, touch.pageY);
        }}
        onTouchEnd={(event) => {
          const touch = event.nativeEvent.changedTouches[0];
          if (touch) handleTouchEnd(touch.pageX, touch.pageY);
        }}
        onTouchCancel={() => {
          touchStartRef.current = null;
        }}
        renderItem={({ item }) => {
          if (item.kind === 'break') {
            return (
              <View
                style={styles.chapterBreak}
                onLayout={(event) => {
                  applyItemHeight(item.id, event.nativeEvent.layout.height);
                }}>
                <ReaderChapterBoundary
                  kind='end'
                  chapterLabel={chapterLabel(item.previous)}
                  nextChapterLabel={chapterLabel(item.next)}
                  foregroundColor={foregroundColor}
                  onPress={actions.toggleBars}
                />
                <ReaderChapterBoundary
                  kind='start'
                  chapterLabel={chapterLabel(item.next)}
                  foregroundColor={foregroundColor}
                  onPress={actions.toggleBars}
                />
              </View>
            );
          }

          return (
            <View
              style={[styles.page, { width, height: heightForItem(item) }]}
              key={`${item.id}-${reloadKeys[item.id] ?? 0}`}>
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
                layout='intrinsic'
                containerWidth={width}
                onMeasuredAspectRatio={(ratio) => {
                  applyItemHeight(item.id, readerPageFrameHeight(item, contentWidth, ratio, estimatedHeight));
                }}
                onSingleTap={handleTap}
                onLongPress={(x, y) => {
                  if (settings.disableQuickActions || dictionarySettings.lookupGesture === 'long-press') return;
                  setQuickActionsPage(item);
                  setQuickActionsAnchor({ x, y });
                }}
                onDictionaryLookup={(x, y) =>
                  actions.lookupDictionary(item.url ?? '', x, y, { width, height })
                }
              />
            </View>
          );
        }}
      />
      <ReaderQuickActions
        visible={quickActionsPage != null}
        page={quickActionsPage}
        anchor={quickActionsAnchor}
        onClose={() => {
          setQuickActionsPage(null);
          setQuickActionsAnchor(null);
        }}
        onReload={() => {
          if (!quickActionsPage) return;
          setReloadKeys((current) => ({
            ...current,
            [quickActionsPage.id]: (current[quickActionsPage.id] ?? 0) + 1,
          }));
        }}
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
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  chapterBreak: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
