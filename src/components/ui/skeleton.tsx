import { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export function SkeletonBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + pulse.value * 0.5,
  }));

  return (
    <Animated.View
      style={[{ backgroundColor: colors.secondaryFill }, style, animatedStyle]}
    />
  );
}

export function MangaGridSkeleton({ columns = 3, rows = 4 }: { columns?: number; rows?: number }) {
  const { width: windowWidth } = useWindowDimensions();
  const { radius } = useTheme();
  const gap = Spacing.md;
  const itemWidth = Math.floor((windowWidth - Spacing.lg * 2 - gap * (columns - 1)) / columns);
  const itemHeight = Math.round(itemWidth * 1.45);

  return (
    <View style={styles.grid}>
      {Array.from({ length: columns * rows }, (_, index) => (
        <View key={index} style={{ width: itemWidth, gap: Spacing.xs }}>
          <SkeletonBlock style={{ width: itemWidth, height: itemHeight, borderRadius: radius.sm }} />
          <SkeletonBlock style={{ width: itemWidth * 0.7, height: 10, borderRadius: 5 }} />
        </View>
      ))}
    </View>
  );
}

export function HistorySkeleton({ rows = 7 }: { rows?: number }) {
  const { radius } = useTheme();

  return (
    <View style={styles.list}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.historyRow}>
          <SkeletonBlock style={{ width: 52, height: 76, borderRadius: radius.sm }} />
          <View style={styles.historyText}>
            <SkeletonBlock style={{ width: "70%", height: 14, borderRadius: 7 }} />
            <SkeletonBlock style={{ width: "45%", height: 12, borderRadius: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ChapterListSkeleton({ rows = 7 }: { rows?: number }) {
  const { colors, radius } = useTheme();

  return (
    <View
      style={[
        styles.chapterCard,
        {
          backgroundColor: colors.secondarySystemBackground,
          borderRadius: radius.md,
        },
      ]}
    >
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.chapterRow}>
          <View style={styles.chapterText}>
            <SkeletonBlock
              style={{ width: `${55 + ((index * 13) % 30)}%`, height: 14, borderRadius: 7 }}
            />
            <SkeletonBlock style={{ width: "32%", height: 11, borderRadius: 6 }} />
          </View>
          <SkeletonBlock style={{ width: 54, height: 20, borderRadius: 10 }} />
        </View>
      ))}
    </View>
  );
}

export function MangaDetailSkeleton() {
  const { radius } = useTheme();

  return (
    <View style={styles.detail}>
      <View style={styles.detailHeader}>
        <SkeletonBlock style={{ width: 110, height: 160, borderRadius: radius.md }} />
        <View style={styles.historyText}>
          <SkeletonBlock style={{ width: "80%", height: 18, borderRadius: 9 }} />
          <SkeletonBlock style={{ width: "50%", height: 13, borderRadius: 7 }} />
          <SkeletonBlock style={{ width: "35%", height: 13, borderRadius: 7 }} />
        </View>
      </View>
      <SkeletonBlock style={{ width: "100%", height: 46, borderRadius: radius.md }} />
      <ChapterListSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  chapterCard: {
    overflow: "hidden",
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  chapterText: {
    flex: 1,
    gap: Spacing.xs,
  },
  detail: {
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  detailHeader: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  list: {
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  historyText: {
    flex: 1,
    gap: Spacing.sm,
  },
});
