// Android copy of pinned-tabs: no transparent header to stay below.
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { Spacing } from "@/constants/theme";

// Gap between the tab bar and the content below it.
const TABS_CONTENT_GAP = Spacing.md;
// Sentinel for "no scroll event yet": far enough negative that the sticky position is never driven by it.
const NOT_SCROLLED = -100000;
const JS_SCROLL_INTERVAL_MS = 100;

type ScrollJsHandler = (
  event: NativeSyntheticEvent<NativeScrollEvent>,
) => void;

// Keeps a tab bar pinned below the navigation bar while a list scrolls underneath, entirely on the UI thread.
//
// Why not stickyHeaderIndices? The native sticky header scrolls away under a transparent/large-title
// header. Instead the layout is:
//  - an in-flow `spacer` that reserves the tab bar's space at its natural position in the list,
//  - the tab bar itself (renderTabs), absolutely positioned, translated by
//    max(naturalTop, scrollY + collapsedTop) so it follows the content until it reaches the header and then stays.
// The tab bar must be the LAST child of the scroll root's container so it is painted above the list rows.
// Optionally `onScrollJS` receives throttled scroll events on the JS thread (for logic that needs them).
export function usePinnedTabs(
  visible: boolean,
  options?: { gap?: number; onScrollJS?: ScrollJsHandler },
) {
  const scrollY = useSharedValue(NOT_SCROLLED);
  const lastJsCall = useSharedValue(0);
  const tabsTop = useSharedValue(0);
  const [height, setHeight] = useState(0);
  const gap = options?.gap ?? TABS_CONTENT_GAP;
  const onScrollJS = options?.onScrollJS;
  // Android: the header is opaque and in flow, so scrollY = 0 is already just below it and the tabs
  // stick at the very top of the scroll area (iOS adds the safe area + bar height here instead).
  const collapsedTop = 0;

  // Re-creates a scroll event on the JS thread from the plain numbers sent by the worklet.
  const callJs = useCallback(
    (payload: {
      contentOffset: { x: number; y: number };
      contentSize: { width: number; height: number };
      layoutMeasurement: { width: number; height: number };
    }) => {
      onScrollJS?.({ nativeEvent: payload } as NativeSyntheticEvent<NativeScrollEvent>);
    },
    [onScrollJS],
  );

  // Worklet: runs on the UI thread for every scroll frame. The JS callback is throttled to avoid flooding the bridge.
  const onScroll = useAnimatedScrollHandler(
    (event) => {
      scrollY.value = event.contentOffset.y;
      if (!onScrollJS) return;
      const now = Date.now();
      if (now - lastJsCall.value < JS_SCROLL_INTERVAL_MS) return;
      lastJsCall.value = now;
      scheduleOnRN(callJs, {
        contentOffset: {
          x: event.contentOffset.x,
          y: event.contentOffset.y,
        },
        contentSize: {
          width: event.contentSize.width,
          height: event.contentSize.height,
        },
        layoutMeasurement: {
          width: event.layoutMeasurement.width,
          height: event.layoutMeasurement.height,
        },
      });
    },
    [onScrollJS, callJs, collapsedTop],
  );

  const stickyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: Math.max(tabsTop.value, scrollY.value + collapsedTop) },
    ],
  }));

  const containerStyle = useMemo(
    () => [styles.sticky, stickyStyle],
    [stickyStyle],
  );

  // The spacer's y is the tab bar's natural (unscrolled) position.
  const onSpacerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      tabsTop.value = event.nativeEvent.layout.y;
    },
    [tabsTop],
  );

  const onTabsLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    setHeight((prev) => (prev === next ? prev : next));
  }, []);

  const spacer = visible ? (
    <View style={{ height: height + gap }} onLayout={onSpacerLayout} />
  ) : null;

  const renderTabs = (tabs: ReactNode) =>
    visible ? (
      <Animated.View
        collapsable={false}
        style={containerStyle}
        onLayout={onTabsLayout}
      >
        {tabs}
      </Animated.View>
    ) : null;

  const setScrollOffset = useCallback(
    (offsetY: number) => {
      scrollY.value = offsetY;
    },
    [scrollY],
  );

  return { onScroll, setScrollOffset, spacer, renderTabs };
}

const styles = StyleSheet.create({
  sticky: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
});
