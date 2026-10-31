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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { Spacing } from "@/constants/theme";

const TABS_CONTENT_GAP = Spacing.md;
const COLLAPSED_BAR_HEIGHT = 58;
const NOT_SCROLLED = -100000;
const JS_SCROLL_INTERVAL_MS = 100;

type ScrollJsHandler = (
  event: NativeSyntheticEvent<NativeScrollEvent>,
) => void;

export function usePinnedTabs(
  visible: boolean,
  options?: { gap?: number; onScrollJS?: ScrollJsHandler },
) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(NOT_SCROLLED);
  const lastJsCall = useSharedValue(0);
  const tabsTop = useSharedValue(0);
  const [height, setHeight] = useState(0);
  const gap = options?.gap ?? TABS_CONTENT_GAP;
  const onScrollJS = options?.onScrollJS;
  const collapsedTop = insets.top + COLLAPSED_BAR_HEIGHT;

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

  return { onScroll, spacer, renderTabs };
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
