import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { usePanGesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { READER_GLASS_TINT } from "@/utils/reader-glass";
import { GlassSurface } from "@/components/ui/glass-surface";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";

type ReaderPageSliderProps = {
  currentPage: number;
  totalPages: number;
  accentColor: string;
  labelColor: string;
  inverted?: boolean;
  onSeek: (page: number) => void;
};

const THUMB_WIDTH = 42;
const THUMB_HEIGHT = 28;
const BAR_HEIGHT = 52;
const PRESS_SPRING = { damping: 16, stiffness: 220, mass: 0.7 };
const TRACK_HEIGHT = 6;

export function ReaderPageSlider({
  currentPage,
  totalPages,
  accentColor,
  labelColor,
  inverted = false,
  onSeek,
}: ReaderPageSliderProps) {
  const [sliding, setSliding] = useState(false);
  const [slideValue, setSlideValue] = useState(currentPage);
  const lastHapticRef = useRef(currentPage);
  const widthRef = useRef(1);
  const trackPageXRef = useRef(0);
  const trackRef = useRef<View>(null);
  const widthSV = useSharedValue(1);
  const trackPageXSV = useSharedValue(0);
  const maxSV = useSharedValue(Math.max(0, totalPages - 1));
  const progressSV = useSharedValue(currentPage);
  const invertedSV = useSharedValue(inverted);
  const pressSV = useSharedValue(0);
  const invertedRef = useRef(inverted);

  const currentPageRef = useRef(currentPage);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);
  const slidingRef = useRef(false);

  const max = Math.max(0, totalPages - 1);
  const displayPage = sliding ? slideValue : currentPage;
  const clamped = Math.min(Math.max(0, displayPage), max);

  useEffect(() => {
    invertedRef.current = inverted;
    invertedSV.value = inverted;
  }, [inverted, invertedSV]);

  useEffect(() => {
    maxSV.value = max;
  }, [max, maxSV]);

  useEffect(() => {
    if (sliding) return;
    setSlideValue(currentPage);
    progressSV.value = currentPage;
  }, [currentPage, progressSV, sliding]);

  const pageFromAbsoluteX = (absoluteX: number) => {
    const width = widthRef.current;
    if (width <= 0 || max <= 0) return 0;
    const raw = Math.min(
      1,
      Math.max(0, (absoluteX - trackPageXRef.current) / width),
    );
    const ratio = invertedRef.current ? 1 - raw : raw;
    return Math.round(ratio * max);
  };

  const applyPage = (page: number, haptic: boolean) => {
    const next = Math.min(Math.max(0, page), max);
    setSlideValue(next);
    if (haptic && next !== lastHapticRef.current) {
      lastHapticRef.current = next;
      if (max > 0 && (next === 0 || next === max)) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, 90);
      } else {
        void Haptics.selectionAsync();
      }
    }
  };

  const beginSlide = (absoluteX: number) => {
    slidingRef.current = true;
    setSliding(true);
    lastHapticRef.current = currentPageRef.current;
    const next = pageFromAbsoluteX(absoluteX);
    progressSV.value = next;
    applyPage(next, true);
  };

  const moveSlide = (absoluteX: number) => {
    const next = pageFromAbsoluteX(absoluteX);
    progressSV.value = next;
    applyPage(next, true);
  };

  const endSlide = (absoluteX: number) => {
    if (!slidingRef.current) return;
    slidingRef.current = false;
    const next = pageFromAbsoluteX(absoluteX);
    progressSV.value = next;
    setSlideValue(next);
    setSliding(false);
    onSeek(next);
  };

  const cancelSlide = () => {
    if (!slidingRef.current) return;
    slidingRef.current = false;
    const restore = currentPageRef.current;
    setSliding(false);
    setSlideValue(restore);
    progressSV.value = restore;
  };

  const panGesture = usePanGesture({
    minDistance: 0,
    shouldCancelWhenOutside: false,
    onActivate: (event) => {
      "worklet";
      pressSV.value = withSpring(1, PRESS_SPRING);
      scheduleOnRN(beginSlide, event.absoluteX);
    },
    onUpdate: (event) => {
      "worklet";
      const trackWidth = widthSV.value;
      const maxPage = maxSV.value;
      const localX = event.absoluteX - trackPageXSV.value;
      const raw =
        trackWidth <= 0 || maxPage <= 0
          ? 0
          : Math.min(1, Math.max(0, localX / trackWidth));
      const ratio = invertedSV.value ? 1 - raw : raw;
      progressSV.value = Math.round(ratio * maxPage);
      scheduleOnRN(moveSlide, event.absoluteX);
    },
    onDeactivate: (event) => {
      "worklet";
      pressSV.value = withSpring(0, PRESS_SPRING);
      if (!event.canceled) {
        scheduleOnRN(endSlide, event.absoluteX);
      } else {
        scheduleOnRN(cancelSlide);
      }
    },
  });

  const thumbStyle = useAnimatedStyle(() => {
    const width = widthSV.value;
    const maxPage = Math.max(1, maxSV.value);
    const travel = Math.max(0, width - THUMB_WIDTH);
    const ratio = maxSV.value <= 0 ? 0.5 : progressSV.value / maxPage;
    const visual = invertedSV.value ? 1 - ratio : ratio;
    return {
      transform: [
        { translateX: visual * travel },
        { scaleX: 1 + pressSV.value * 0.45 },
        { scaleY: 1 + pressSV.value * 0.5 },
      ],
    };
  });

  const thumbWhiteStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressSV.value,
  }));

  const fillStyle = useAnimatedStyle(() => {
    const width = widthSV.value;
    const maxPage = Math.max(1, maxSV.value);
    const travel = Math.max(0, width - THUMB_WIDTH);
    const ratio = maxSV.value <= 0 ? 0 : progressSV.value / maxPage;
    const visual = invertedSV.value ? 1 - ratio : ratio;
    const filled =
      Math.max(0, Math.min(travel, visual * travel)) + THUMB_WIDTH / 2;
    return invertedSV.value
      ? { width: width - filled, right: 0 }
      : { width: filled, left: 0 };
  });

  return (
    <GlassSurface borderRadius={BAR_HEIGHT / 2} glassStyle="clear" tintColor={READER_GLASS_TINT} style={styles.glass}>
      <ThemedText
        variant="footnote"
        style={[styles.label, { color: labelColor }]}
      >
        {inverted ? totalPages : clamped + 1}
      </ThemedText>
      <GestureDetector gesture={panGesture}>
        <View
          ref={trackRef}
          style={styles.trackHit}
          onLayout={(event) => {
            const nextWidth = Math.max(1, event.nativeEvent.layout.width);
            widthRef.current = nextWidth;
            widthSV.value = nextWidth;
            trackRef.current?.measureInWindow((x) => {
              trackPageXRef.current = x;
              trackPageXSV.value = x;
            });
          }}
        >
          <View style={styles.track}>
            <Animated.View
              style={[styles.fill, { backgroundColor: accentColor }, fillStyle]}
            />
          </View>
          <Animated.View style={[styles.thumb, thumbStyle]}>
            <GlassSurface
              borderRadius={THUMB_HEIGHT / 2}
              glassStyle="clear"
              interactive
              style={StyleSheet.absoluteFill}
            />
            <Animated.View style={[styles.thumbWhite, thumbWhiteStyle]} />
          </Animated.View>
        </View>
      </GestureDetector>
      <ThemedText
        variant="footnote"
        style={[styles.label, { color: labelColor }]}
      >
        {inverted ? clamped + 1 : totalPages}
      </ThemedText>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  glass: {
    height: BAR_HEIGHT,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  label: {
    minWidth: 24,
    textAlign: "center",
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  trackHit: {
    flex: 1,
    height: BAR_HEIGHT,
    justifyContent: "center",
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  thumbWhite: {
    ...StyleSheet.absoluteFill,
    borderRadius: THUMB_HEIGHT / 2,
    backgroundColor: "#FFFFFF",
  },
  thumb: {
    position: "absolute",
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: THUMB_HEIGHT / 2,
    top: (BAR_HEIGHT - THUMB_HEIGHT) / 2,
  },
});
