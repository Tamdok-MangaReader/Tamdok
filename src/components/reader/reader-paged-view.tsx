import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import {
  GestureDetector,
  useTapGesture,
  useNativeGesture,
  useSimultaneousGestures,
} from "react-native-gesture-handler";
import PagerView from "react-native-pager-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ReaderChapterBoundary } from "@/components/reader/reader-chapter-boundary";
import {
  ReaderQuickActions,
  type ReaderQuickActionAnchor,
} from "@/components/reader/reader-quick-actions";
import { useReader } from "@/components/reader/reader-context";
import { ReaderSpreadPage } from "@/components/reader/reader-spread-page";
import {
  effectiveTapZoneGrid,
  tapActionAtPoint,
} from "@/utils/reader-tap-zones";
import { findAdjacentChapter } from "@/utils/reader-chapters";
import {
  chapterTitleForDisplay,
  formatChapterLabel,
} from "@/utils/chapter-label";
import {
  buildSpreads,
  defaultIsolatedPages,
  firstToggleableHead,
  isPagePairable,
  pageIndexForSpread,
  spreadIndexForPage,
  usesDoublePageLayout,
} from "@/utils/reader-spreads";
import type { ReaderPage } from "@/utils/reader-pages";

type ReaderPagedViewProps = {
  onPageChange: (index: number) => void;
  onInteraction: () => void;
  currentPage: number;
  setPageRef: (goToPage: (index: number, animated?: boolean) => void) => void;
  pageOffsetEnabled: boolean;
  onTogglePageOffset: () => void;
};

type LeaveDirection = "previous" | "next";

const LEAVE_GUARD_MS = 1500;

export function ReaderPagedView({
  onPageChange,
  onInteraction,
  currentPage,
  setPageRef,
  pageOffsetEnabled,
  onTogglePageOffset,
}: ReaderPagedViewProps) {
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
  } = useReader();
  const pagerRef = useRef<PagerView>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tapGrid = useMemo(
    () => effectiveTapZoneGrid(settings, mode),
    [settings, mode],
  );
  const doublePages = usesDoublePageLayout(
    settings.pagedPageLayout,
    width,
    height,
  );

  const [quickActionsPage, setQuickActionsPage] = useState<ReaderPage | null>(
    null,
  );
  const [quickActionsAnchor, setQuickActionsAnchor] =
    useState<ReaderQuickActionAnchor | null>(null);
  const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});
  const pagerIndexRef = useRef(-1);
  const pagerKeyRef = useRef<string | null>(null);
  const skipSelectRef = useRef(false);
  const currentPageRef = useRef(currentPage);
  const lastTapAtRef = useRef(0);
  const leavingRef = useRef(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const pageIdsKey = useMemo(
    () => pages.map((page) => page.id).join(","),
    [pages],
  );
  const isolationKey = `${doublePages}:${pageOffsetEnabled}:${pageIdsKey}`;
  const [isolationKeyTracked, setIsolationKeyTracked] = useState(isolationKey);
  const [isolatedPages, setIsolatedPages] = useState(() =>
    defaultIsolatedPages(pages, doublePages, pageOffsetEnabled),
  );

  if (isolationKeyTracked !== isolationKey) {
    setIsolationKeyTracked(isolationKey);
    setIsolatedPages(
      defaultIsolatedPages(pages, doublePages, pageOffsetEnabled),
    );
  }

  const spreads = useMemo(
    () => buildSpreads(pages, doublePages, isolatedPages),
    [doublePages, isolatedPages, pages],
  );

  const currentSpreadIndex = useMemo(
    () => Math.max(0, spreadIndexForPage(spreads, currentPage)),
    [currentPage, spreads],
  );

  const chapterLabel = useMemo(
    () => chapterTitleForDisplay(chapter) || formatChapterLabel(chapter),
    [chapter],
  );
  const nextChapter = useMemo(
    () =>
      findAdjacentChapter(
        chapters,
        chapter.key,
        "next",
        settings.skipDuplicateChapters,
      ),
    [chapter.key, chapters, settings.skipDuplicateChapters],
  );
  const previousChapter = useMemo(
    () =>
      findAdjacentChapter(
        chapters,
        chapter.key,
        "previous",
        settings.skipDuplicateChapters,
      ),
    [chapter.key, chapters, settings.skipDuplicateChapters],
  );
  const nextChapterLabel = nextChapter
    ? chapterTitleForDisplay(nextChapter) || formatChapterLabel(nextChapter)
    : null;
  const previousChapterLabel = previousChapter
    ? chapterTitleForDisplay(previousChapter) ||
      formatChapterLabel(previousChapter)
    : null;

  const orientation = mode === "vertical" ? "vertical" : "horizontal";
  const layoutDirection = mode === "rtl" ? "rtl" : "ltr";
  const pageMode =
    mode === "vertical" ? "vertical" : mode === "rtl" ? "rtl" : "ltr";
  const offscreenLimit = Math.max(1, Math.min(2, settings.pagesToPreload));

  const lead = previousChapter ? 1 : 0;
  const endPosition = lead + spreads.length;
  const pagerKey = `${chapter.key}:${orientation}:${layoutDirection}:${lead}`;

  if (pagerKeyRef.current !== pagerKey) {
    pagerKeyRef.current = pagerKey;
    pagerIndexRef.current = currentSpreadIndex + lead;
    skipSelectRef.current = false;
  }

  const leaveTo = useCallback(
    (direction: LeaveDirection) => {
      if (leavingRef.current) return;
      if (direction === "next" ? !nextChapter : !previousChapter) return;
      leavingRef.current = true;
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = setTimeout(() => {
        leavingRef.current = false;
      }, LEAVE_GUARD_MS);
      if (direction === "next") actions.goNextChapter();
      else actions.goPrevious();
    },
    [actions, nextChapter, previousChapter],
  );

  const goToSpread = useCallback(
    (spreadIndex: number, animated = settings.animatePageTransitions) => {
      const clamped = Math.max(0, Math.min(spreads.length - 1, spreadIndex));
      const position = clamped + lead;
      if (position !== pagerIndexRef.current) {
        skipSelectRef.current = true;
        pagerIndexRef.current = position;
        if (animated) {
          pagerRef.current?.setPage(position);
        } else {
          pagerRef.current?.setPageWithoutAnimation?.(position);
        }
      }
      onPageChange(pageIndexForSpread(spreads, clamped));
    },
    [lead, onPageChange, settings.animatePageTransitions, spreads],
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
    const position = spreadIndex + lead;
    if (position === pagerIndexRef.current) return;
    skipSelectRef.current = true;
    pagerIndexRef.current = position;
    pagerRef.current?.setPageWithoutAnimation?.(position);
  }, [lead, spreads]);

  const handleTap = useCallback(
    (x: number, y: number) => {
      const now = Date.now();
      if (now - lastTapAtRef.current < 120) return;
      lastTapAtRef.current = now;
      if (settings.tapZones === "disabled") {
        actions.toggleBars();
        return;
      }
      const action = tapActionAtPoint(tapGrid, x, y, width, height);
      if (action === "toggleBars" || action === "none") {
        if (action === "toggleBars") actions.toggleBars();
        return;
      }
      onInteraction();
      const position = pagerIndexRef.current;
      if (action === "next") {
        if (position < lead) {
          goToSpread(0);
          return;
        }
        if (position >= endPosition) return;
        if (currentSpreadIndex >= spreads.length - 1) {
          if (nextChapter) {
            leaveTo("next");
            return;
          }
          pagerRef.current?.setPage(endPosition);
          return;
        }
        goToSpread(currentSpreadIndex + 1);
        return;
      }
      if (action === "previous") {
        if (position >= endPosition) {
          goToSpread(spreads.length - 1);
          return;
        }
        if (position < lead) return;
        if (currentSpreadIndex <= 0) {
          if (previousChapter) leaveTo("previous");
          return;
        }
        goToSpread(currentSpreadIndex - 1);
      }
    },
    [
      actions,
      currentSpreadIndex,
      endPosition,
      goToSpread,
      height,
      lead,
      leaveTo,
      nextChapter,
      onInteraction,
      previousChapter,
      settings.tapZones,
      spreads.length,
      tapGrid,
      width,
    ],
  );

  const toggleIsolationForPage = useCallback(
    (pageIndex: number, isolated: boolean, _manual = true) => {
      setIsolatedPages((current) => {
        const next = new Set(current);
        if (isolated) next.add(pageIndex);
        else next.delete(pageIndex);
        return next;
      });
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
  }, [
    doublePages,
    isolatedPages,
    onTogglePageOffset,
    pages,
    toggleIsolationForPage,
  ]);

  const pageTapGesture = useTapGesture({
    maxDuration: 250,
    maxDistance: 14,
    runOnJS: true,
    onActivate: (event) => {
      handleTap(event.absoluteX ?? event.x, event.absoluteY ?? event.y);
    },
  });

  const offsetToggleGesture = useTapGesture({
    numberOfTaps: 2,
    minPointers: 2,
    maxDuration: 300,
    enabled: doublePages,
    runOnJS: true,
    onActivate: () => {
      handleOffsetToggle();
    },
  });

  const nativePagerGesture = useNativeGesture({});

  const composedGestures = useSimultaneousGestures(
    nativePagerGesture,
    offsetToggleGesture,
    pageTapGesture,
  );

  const handlePageSelected = useCallback(
    (event: { nativeEvent: { position: number } }) => {
      const position = event.nativeEvent.position;
      if (skipSelectRef.current) {
        skipSelectRef.current = false;
        pagerIndexRef.current = position;
        return;
      }
      if (pagerIndexRef.current === position) return;
      pagerIndexRef.current = position;
      if (position < lead) {
        onInteraction();
        leaveTo("previous");
        return;
      }
      if (position >= endPosition) {
        if (nextChapter) {
          onInteraction();
          leaveTo("next");
        }
        return;
      }
      const spread = spreads[position - lead];
      if (!spread) return;
      onPageChange(spread.startPageIndex);
      onInteraction();
    },
    [
      endPosition,
      lead,
      leaveTo,
      nextChapter,
      onInteraction,
      onPageChange,
      spreads,
    ],
  );

  const openQuickActions = useCallback(
    (page: ReaderPage, x: number, y: number) => {
      if (settings.disableQuickActions || !page.url) return;
      setQuickActionsPage(page);
      setQuickActionsAnchor({ x, y });
    },
    [settings.disableQuickActions],
  );

  const handleDictionaryLookup = useCallback(
    (page: ReaderPage, x: number, y: number) =>
      actions.lookupDictionary(page.url ?? "", x, y, { width, height }),
    [actions, height, width],
  );

  const handleCloseQuickActions = useCallback(() => {
    setQuickActionsPage(null);
    setQuickActionsAnchor(null);
  }, []);

  const quickActionsPageIndex = quickActionsPage
    ? pages.findIndex((page) => page.id === quickActionsPage.id)
    : -1;

  const rootStyle = useMemo(
    () => [styles.root, { backgroundColor }],
    [backgroundColor],
  );

  const pagerChildren: ReactElement[] = [];

  if (lead > 0) {
    pagerChildren.push(
      <View key="chapter-start-page" style={styles.page} collapsable={false}>
        <View style={styles.edgePage}>
          <ActivityIndicator color={foregroundColor} />
        </View>
      </View>,
    );
  }

  spreads.forEach((spread, index) => {
    pagerChildren.push(
      <View key={spread.id} style={styles.page} collapsable={false}>
        <View style={styles.pageContent}>
          {Math.abs(index - currentSpreadIndex) <= offscreenLimit ? (
            <View style={styles.spread}>
              <ReaderSpreadPage
                pages={spread.pages}
                settings={settings}
                dictionarySettings={dictionarySettings}
                coverHeaders={coverHeaders}
                backgroundColor={backgroundColor}
                mode={pageMode}
                onSingleTap={handleTap}
                onLongPress={openQuickActions}
                onDictionaryLookup={handleDictionaryLookup}
                reloadKeys={reloadKeys}
              />
            </View>
          ) : (
            <View style={styles.spread} />
          )}

          {index === 0 ? (
            <View style={styles.startBoundary}>
              <ReaderChapterBoundary
                kind="start"
                chapterLabel={chapterLabel}
                previousChapterLabel={previousChapterLabel}
                foregroundColor={foregroundColor}
                safeInset={insets.top}
                onPress={actions.toggleBars}
                onPrevious={
                  previousChapter ? () => leaveTo("previous") : undefined
                }
              />
            </View>
          ) : null}

          {index === spreads.length - 1 && nextChapter ? (
            <View style={styles.endBoundary}>
              <ReaderChapterBoundary
                kind="end"
                chapterLabel={chapterLabel}
                nextChapterLabel={nextChapterLabel}
                foregroundColor={foregroundColor}
                safeInset={insets.bottom}
                onPress={actions.toggleBars}
                onContinue={() => leaveTo("next")}
                compact
              />
            </View>
          ) : null}
        </View>
      </View>,
    );
  });

  pagerChildren.push(
    <View key="chapter-end-page" style={styles.page} collapsable={false}>
      <View style={styles.edgePage}>
        {nextChapter ? (
          <ActivityIndicator color={foregroundColor} />
        ) : (
          <ReaderChapterBoundary
            kind="end"
            chapterLabel={chapterLabel}
            nextChapterLabel={null}
            foregroundColor={foregroundColor}
            safeInset={insets.bottom}
            onPress={actions.toggleBars}
          />
        )}
      </View>
    </View>,
  );

  return (
    <View style={rootStyle}>
      <GestureDetector gesture={composedGestures}>
        <View style={styles.pagerWrap}>
          <PagerView
            ref={pagerRef}
            key={pagerKey}
            style={styles.pager}
            initialPage={currentSpreadIndex + lead}
            orientation={orientation}
            layoutDirection={layoutDirection}
            overdrag
            offscreenPageLimit={offscreenLimit}
            scrollEnabled
            pageMargin={settings.pagedPageOffset && doublePages ? 12 : 0}
            onPageSelected={handlePageSelected}
          >
            {pagerChildren}
          </PagerView>
        </View>
      </GestureDetector>

      <ReaderQuickActions
        visible={quickActionsPage != null}
        page={quickActionsPage}
        anchor={quickActionsAnchor}
        usesDoublePages={doublePages}
        spreadPageIndex={quickActionsPage ? quickActionsPageIndex : undefined}
        isPageIsolated={
          quickActionsPage ? isolatedPages.has(quickActionsPageIndex) : false
        }
        canSetSinglePage={
          quickActionsPage
            ? isPagePairable(pages, quickActionsPageIndex)
            : false
        }
        onClose={handleCloseQuickActions}
        onReload={() => {
          if (!quickActionsPage) return;
          setReloadKeys((current) => ({
            ...current,
            [quickActionsPage.id]: (current[quickActionsPage.id] ?? 0) + 1,
          }));
        }}
        onToggleSinglePage={(isolated) => {
          if (!quickActionsPage || quickActionsPageIndex < 0) return;
          toggleIsolationForPage(quickActionsPageIndex, isolated, true);
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
  },
  pageContent: {
    flex: 1,
    position: "relative",
  },
  spread: {
    flex: 1,
  },
  edgePage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  startBoundary: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  endBoundary: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
});
