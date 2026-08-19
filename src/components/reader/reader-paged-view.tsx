import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReaderChapterBoundary } from '@/components/reader/reader-chapter-boundary';
import { ReaderQuickActions, type ReaderQuickActionAnchor } from '@/components/reader/reader-quick-actions';
import { useReader } from '@/components/reader/reader-context';
import { ReaderSpreadPage } from '@/components/reader/reader-spread-page';
import { effectiveTapZoneGrid, tapActionAtPoint } from '@/utils/reader-tap-zones';
import { findAdjacentChapter } from '@/utils/reader-chapters';
import { chapterTitleForDisplay, formatChapterLabel } from '@/utils/chapter-label';
import {
  buildSpreads,
  defaultIsolatedPages,
  firstToggleableHead,
  isPagePairable,
  pageIndexForSpread,
  spreadIndexForPage,
  usesDoublePageLayout,
} from '@/utils/reader-spreads';
import type { ReaderPage } from '@/utils/reader-pages';

type ReaderPagedViewProps = {
  onPageChange: (index: number) => void;
  onInteraction: () => void;
  currentPage: number;
  setPageRef: (goToPage: (index: number, animated?: boolean) => void) => void;
  pageOffsetEnabled: boolean;
  onTogglePageOffset: () => void;
};

export function ReaderPagedView({
  onPageChange,
  onInteraction,
  currentPage,
  setPageRef,
  pageOffsetEnabled,
  onTogglePageOffset,
}: ReaderPagedViewProps) {
  const { pages, settings, dictionarySettings, mode, backgroundColor, foregroundColor, coverHeaders, actions, chapter, chapters } =
    useReader();
  const pagerRef = useRef<PagerView>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tapGrid = useMemo(() => effectiveTapZoneGrid(settings, mode), [settings, mode]);
  const doublePages = usesDoublePageLayout(settings.pagedPageLayout, width, height);
  const [isolatedPages, setIsolatedPages] = useState<Set<number>>(() =>
    defaultIsolatedPages(pages, doublePages, pageOffsetEnabled),
  );
  const [manualIsolatedPages, setManualIsolatedPages] = useState<Set<number>>(new Set());
  const [quickActionsPage, setQuickActionsPage] = useState<ReaderPage | null>(null);
  const [quickActionsAnchor, setQuickActionsAnchor] = useState<ReaderQuickActionAnchor | null>(null);
  const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});
  const pagerIndexRef = useRef(0);
  const skipSelectRef = useRef(false);
  const currentPageRef = useRef(currentPage);
  const lastTapAtRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  currentPageRef.current = currentPage;

  useEffect(() => {
    setIsolatedPages(defaultIsolatedPages(pages, doublePages, pageOffsetEnabled));
    setManualIsolatedPages(new Set());
  }, [pages, doublePages, pageOffsetEnabled, settings.pagedPageLayout]);

  const spreads = useMemo(
    () => buildSpreads(pages, doublePages, isolatedPages),
    [doublePages, isolatedPages, pages],
  );

  // Map logical page index to pager spread index (pairs two pages on wide layouts).
  const currentSpreadIndex = useMemo(
    () => Math.max(0, spreadIndexForPage(spreads, currentPage)),
    [currentPage, spreads],
  );

  const handleTouchStart = useCallback((x: number, y: number) => {
    touchStartRef.current = { x, y, time: Date.now() };
  }, []);

  const goToSpread = useCallback(
    (spreadIndex: number, animated = settings.animatePageTransitions) => {
      const clamped = Math.max(0, Math.min(spreads.length - 1, spreadIndex));
      skipSelectRef.current = true;
      pagerIndexRef.current = clamped;
      if (animated) {
        pagerRef.current?.setPage(clamped);
      } else {
        pagerRef.current?.setPageWithoutAnimation?.(clamped);
      }
      onPageChange(pageIndexForSpread(spreads, clamped));
    },
    [onPageChange, settings.animatePageTransitions, spreads],
  );

  const goToPage = useCallback(
    (pageIndex: number, animated = settings.animatePageTransitions) => {
      goToSpread(spreadIndexForPage(spreads, pageIndex), animated);
    },
    [goToSpread, settings.animatePageTransitions, spreads],
  );

  useEffect(() => {
    setPageRef(goToPage);
  }, [goToPage, setPageRef]);

  useEffect(() => {
    const spreadIndex = spreadIndexForPage(spreads, currentPageRef.current);
    if (spreadIndex < 0 || spreadIndex >= spreads.length) return;
    if (spreadIndex === pagerIndexRef.current) return;
    skipSelectRef.current = true;
    pagerIndexRef.current = spreadIndex;
    pagerRef.current?.setPageWithoutAnimation?.(spreadIndex);
  }, [spreads]);

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
        if (currentSpreadIndex >= spreads.length - 1) {
          actions.goNextChapter();
          return;
        }
        goToSpread(currentSpreadIndex + 1);
        return;
      }
      if (action === 'previous') {
        if (currentSpreadIndex <= 0) {
          actions.goPrevious();
          return;
        }
        goToSpread(currentSpreadIndex - 1);
      }
    },
    [
      actions,
      currentSpreadIndex,
      goToSpread,
      height,
      mode,
      onInteraction,
      settings.tapZones,
      spreads.length,
      tapGrid,
      width,
    ],
  );

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

  const pageTapGesture = Gesture.Tap()
    .maxDuration(250)
    .maxDistance(14)
    .onEnd((event, success) => {
      if (!success) return;
      runOnJS(handleTap)(event.absoluteX ?? event.x, event.absoluteY ?? event.y);
    });

  const toggleIsolationForPage = useCallback(
    (pageIndex: number, isolated: boolean, manual = true) => {
      setIsolatedPages((current) => {
        const next = new Set(current);
        if (isolated) next.add(pageIndex);
        else next.delete(pageIndex);
        return next;
      });
      if (manual) {
        setManualIsolatedPages((current) => {
          const next = new Set(current);
          if (isolated) next.add(pageIndex);
          else next.delete(pageIndex);
          return next;
        });
      }
      goToPage(pageIndex, false);
    },
    [goToPage],
  );

  const handleOffsetToggle = useCallback(() => {
    if (!doublePages) return;
    onTogglePageOffset();
    const head = firstToggleableHead(pages, doublePages);
    if (head <= 0) return;
    const currentlyIsolated = isolatedPages.has(head);
    toggleIsolationForPage(head, !currentlyIsolated, true);
  }, [doublePages, isolatedPages, onTogglePageOffset, pages, toggleIsolationForPage]);

  const offsetToggleGesture = Gesture.Tap()
    .numberOfTaps(2)
    .minPointers(2)
    .maxDuration(300)
    .enabled(doublePages)
    .onEnd(() => {
      runOnJS(handleOffsetToggle)();
    });

  const nativePagerGesture = Gesture.Native();
  const composedGestures = Gesture.Simultaneous(nativePagerGesture, offsetToggleGesture, pageTapGesture);

  const orientation = mode === 'vertical' ? 'vertical' : 'horizontal';
  const layoutDirection = mode === 'rtl' ? 'rtl' : 'ltr';
  const offscreenLimit = Math.max(4, Math.min(8, settings.pagesToPreload));

  const chapterLabel = useMemo(
    () => chapterTitleForDisplay(chapter) || formatChapterLabel(chapter),
    [chapter],
  );
  const nextChapter = useMemo(
    () => findAdjacentChapter(chapters, chapter.key, 'next', settings.skipDuplicateChapters),
    [chapter.key, chapters, settings.skipDuplicateChapters],
  );
  const nextChapterLabel = nextChapter
    ? chapterTitleForDisplay(nextChapter) || formatChapterLabel(nextChapter)
    : null;

  const openQuickActions = (page: ReaderPage, x: number, y: number) => {
    if (settings.disableQuickActions || !page.url) return;
    setQuickActionsPage(page);
    setQuickActionsAnchor({ x, y });
  };

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <GestureDetector gesture={composedGestures}>
        <View style={styles.pagerWrap}>
          <PagerView
            ref={pagerRef}
            key={`${chapter.key}:${orientation}:${layoutDirection}`}
            style={styles.pager}
            initialPage={currentSpreadIndex}
            orientation={orientation}
            layoutDirection={layoutDirection}
            overdrag
            offscreenPageLimit={offscreenLimit}
            scrollEnabled
            pageMargin={settings.pagedPageOffset && doublePages ? 12 : 0}
            onPageSelected={(event) => {
              const position = event.nativeEvent.position;
              if (skipSelectRef.current) {
                skipSelectRef.current = false;
                pagerIndexRef.current = position;
                return;
              }
              if (pagerIndexRef.current === position) return;
              pagerIndexRef.current = position;
              const spread = spreads[position];
              if (!spread) return;
              onPageChange(spread.startPageIndex);
              onInteraction();
            }}>
            {spreads.map((spread, index) => (
              <View
                key={spread.id}
                style={styles.page}
                collapsable={false}
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
                }}>
                {index === 0 ? (
                  <ReaderChapterBoundary
                    kind='start'
                    chapterLabel={chapterLabel}
                    foregroundColor={foregroundColor}
                    safeInset={insets.top}
                    onPress={actions.toggleBars}
                  />
                ) : null}
                <View style={styles.spread}>
                  <ReaderSpreadPage
                    pages={spread.pages}
                    settings={settings}
                    dictionarySettings={dictionarySettings}
                    coverHeaders={coverHeaders}
                    backgroundColor={backgroundColor}
                    mode={mode === 'vertical' ? 'vertical' : mode === 'rtl' ? 'rtl' : 'ltr'}
                    onSingleTap={handleTap}
                    onLongPress={(page, x, y) => openQuickActions(page, x, y)}
                    onDictionaryLookup={(page, x, y) =>
                      actions.lookupDictionary(page.url ?? '', x, y, { width, height })
                    }
                    reloadKeys={reloadKeys}
                  />
                </View>
                {index === spreads.length - 1 ? (
                  <ReaderChapterBoundary
                    kind='end'
                    chapterLabel={chapterLabel}
                    nextChapterLabel={nextChapterLabel}
                    foregroundColor={foregroundColor}
                    safeInset={insets.bottom}
                    onPress={actions.toggleBars}
                    onContinue={nextChapter ? actions.goNextChapter : undefined}
                  />
                ) : null}
              </View>
            ))}
          </PagerView>
        </View>
      </GestureDetector>

      <ReaderQuickActions
        visible={quickActionsPage != null}
        page={quickActionsPage}
        anchor={quickActionsAnchor}
        usesDoublePages={doublePages}
        spreadPageIndex={
          quickActionsPage ? pages.findIndex((page) => page.id === quickActionsPage.id) : undefined
        }
        isPageIsolated={
          quickActionsPage
            ? isolatedPages.has(pages.findIndex((page) => page.id === quickActionsPage.id))
            : false
        }
        canSetSinglePage={
          quickActionsPage
            ? isPagePairable(
                pages,
                pages.findIndex((page) => page.id === quickActionsPage.id),
              )
            : false
        }
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
        onToggleSinglePage={(isolated) => {
          if (!quickActionsPage) return;
          const pageIndex = pages.findIndex((page) => page.id === quickActionsPage.id);
          if (pageIndex < 0) return;
          toggleIsolationForPage(pageIndex, isolated, true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  pagerWrap: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    flexDirection: 'column',
  },
  spread: {
    flex: 1,
  },
});
