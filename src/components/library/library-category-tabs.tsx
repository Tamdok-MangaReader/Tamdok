import { useIsFocused } from "expo-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { GlassView } from "expo-glass-effect";

import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type LibraryCategoryTab = {
  id: string;
  label: string;
  count?: number;
};

type LibraryCategoryTabsProps = {
  tabs: LibraryCategoryTab[];
  progress: SharedValue<number>;
  onPress: (index: number) => void;
};

type CategoryTabProps = {
  index: number;
  label: string;
  count?: number;
  progress: SharedValue<number>;
  onPress: (index: number) => void;
  onTabLayout: (index: number, x: number, width: number) => void;
};

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

const TRACK_PADDING = 3;
const TRACK_COLOR = "rgba(120, 120, 128, 0.16)";

const CategoryTab = memo(function CategoryTab({
  index,
  label,
  count,
  progress,
  onPress,
  onTabLayout,
}: CategoryTabProps) {
  const { colors } = useTheme();

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      Math.abs(progress.value - index),
      [0, 1],
      [1, 0.6],
      Extrapolation.CLAMP,
    ),
  }));

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      onTabLayout(index, x, width);
    },
    [index, onTabLayout],
  );

  return (
    <Pressable
      style={styles.tab}
      onPress={() => onPress(index)}
      onLayout={handleLayout}
    >
      <Animated.View style={[styles.tabInner, animatedStyle]}>
        <ThemedText variant="subheadline" numberOfLines={1}>
          {label}
        </ThemedText>
        {count !== undefined ? (
          <View
            style={[styles.count, { backgroundColor: colors.tertiaryFill }]}
          >
            <ThemedText variant="caption1" color="secondaryLabel">
              {count}
            </ThemedText>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
});

export function LibraryCategoryTabs({
  tabs,
  progress,
  onPress,
}: LibraryCategoryTabsProps) {
  const { width: windowWidth } = useWindowDimensions();
  const { colors, isDark, isGlass } = useTheme();
  const edge = Spacing.lg;
  const [fitWidth, setFitWidth] = useState<number | null>(null);
  const [glassKey, setGlassKey] = useState(0);
  const [measured, setMeasured] = useState(false);
  const nudge = useSharedValue(0);
  const focused = useIsFocused();

  useEffect(() => {
    if (!measured || !focused) return;
    setGlassKey((value) => value + 1);
    const timers = [80, 250, 600].map((delay, i) =>
      setTimeout(() => {
        nudge.value = i % 2 === 0 ? 1 : 0;
      }, delay),
    );
    const last = setTimeout(() => {
      nudge.value = 0;
    }, 900);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(last);
    };
  }, [measured, focused, nudge]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setGlassKey((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const contentWidth = useSharedValue(0);
  const lefts = useSharedValue<number[]>([]);
  const widths = useSharedValue<number[]>([]);
  const layoutsRef = useRef<({ x: number; width: number } | undefined)[]>([]);

  const tabCount = tabs.length;

  const handleTabLayout = useCallback(
    (index: number, x: number, width: number) => {
      layoutsRef.current[index] = { x, width };

      const items = layoutsRef.current.slice(0, tabCount);
      if (items.length !== tabCount || !items.every(Boolean)) return;

      lefts.value = items.map((item) => item!.x);
      widths.value = items.map((item) => item!.width);
      setMeasured(true);
    },
    [tabCount, lefts, widths],
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  useAnimatedReaction(
    () => ({
      value: progress.value,
      count: lefts.value.length,
      viewport: viewportWidth.value,
      content: contentWidth.value,
    }),
    (state) => {
      const leftValues = lefts.value;
      const widthValues = widths.value;
      const count = leftValues.length;

      if (count === 0 || state.viewport === 0) return;

      let left = leftValues[0];
      let right = leftValues[0] + widthValues[0];

      if (count > 1) {
        const indices = leftValues.map((_, i) => i);
        const rights = leftValues.map((x, i) => x + widthValues[i]);
        left = interpolate(
          state.value,
          indices,
          leftValues,
          Extrapolation.CLAMP,
        );
        right = interpolate(state.value, indices, rights, Extrapolation.CLAMP);
      }

      const maxScroll = Math.max(0, state.content - state.viewport);
      let next = scrollX.value;

      if (left - edge < next) {
        next = left - edge;
      } else if (right + edge > next + state.viewport) {
        next = right + edge - state.viewport;
      }

      next = Math.min(maxScroll, Math.max(0, next));

      if (Math.abs(next - scrollX.value) < 0.5) return;

      scrollX.value = next;
      scrollTo(scrollRef, next, 0, false);
    },
  );

  const thumbStyle = useAnimatedStyle(() => {
    const leftValues = lefts.value;
    const widthValues = widths.value;
    const count = leftValues.length;

    if (count === 0) {
      return { width: 0, transform: [{ translateX: 0 }] };
    }

    if (count === 1) {
      return {
        width: widthValues[0] + nudge.value * 0.5,
        transform: [{ translateX: leftValues[0] }],
      };
    }

    const indices = leftValues.map((_, i) => i);

    return {
      width:
        interpolate(
          progress.value,
          indices,
          widthValues,
          Extrapolation.CLAMP,
        ) +
        nudge.value * 0.5,
      transform: [
        {
          translateX: interpolate(
            progress.value,
            indices,
            leftValues,
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <View
      style={[
        styles.track,
        styles.trackFit,
        { maxWidth: windowWidth - Spacing.lg * 2 },
        fitWidth != null ? { width: fitWidth } : styles.trackHidden,
      ]}
    >
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        onLayout={(event) => {
          viewportWidth.value = event.nativeEvent.layout.width;
        }}
        onContentSizeChange={(width) => {
          contentWidth.value = width;
          setFitWidth(width);
        }}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {isGlass ? (
          <AnimatedGlassView
            key={glassKey}
            pointerEvents="none"
            glassEffectStyle="regular"
            colorScheme={isDark ? "dark" : "light"}
            style={[styles.thumb, thumbStyle]}
          />
        ) : (
          <Animated.View
            pointerEvents="none"
            style={[styles.thumb, { backgroundColor: colors.secondaryFill }, thumbStyle]}
          />
        )}
        {tabs.map((tab, index) => (
          <CategoryTab
            key={tab.id}
            index={index}
            label={tab.label}
            count={tab.count}
            progress={progress}
            onPress={onPress}
            onTabLayout={handleTabLayout}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    borderRadius: 999,
    borderCurve: "continuous",
    backgroundColor: TRACK_COLOR,
  },
  trackFit: {
    alignSelf: "center",
  },
  trackHidden: {
    opacity: 0,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    padding: TRACK_PADDING,
  },
  tab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  tabInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  thumb: {
    position: "absolute",
    left: 0,
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    borderRadius: 999,
    borderCurve: "continuous",
  },
  count: {
    minWidth: 20,
    minHeight: 20,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
});
