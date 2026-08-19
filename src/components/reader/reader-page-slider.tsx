import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';

type ReaderPageSliderProps = {
  currentPage: number;
  totalPages: number;
  accentColor: string;
  labelColor: string;
  onSeek: (page: number) => void;
};

const THUMB_SIZE = 16;
const TRACK_HEIGHT = 10;
const SECTION_GAP = 2;

export function ReaderPageSlider({
  currentPage,
  totalPages,
  accentColor,
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

  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const slidingRef = useRef(false);

  const max = Math.max(0, totalPages - 1);
  const displayPage = sliding ? slideValue : currentPage;
  const clamped = Math.min(Math.max(0, displayPage), max);

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
    const ratio = Math.min(1, Math.max(0, (absoluteX - trackPageXRef.current) / width));
    return Math.round(ratio * max);
  };

  const applyPage = (page: number, haptic: boolean) => {
    const next = Math.min(Math.max(0, page), max);
    setSlideValue(next);
    if (haptic && next !== lastHapticRef.current) {
      lastHapticRef.current = next;
      void Haptics.selectionAsync();
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

  const panGesture = Gesture.Pan()
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin((event) => {
      runOnJS(beginSlide)(event.absoluteX);
    })
    .onUpdate((event) => {
      const trackWidth = widthSV.value;
      const maxPage = maxSV.value;
      const localX = event.absoluteX - trackPageXSV.value;
      const ratio = trackWidth <= 0 || maxPage <= 0 ? 0 : Math.min(1, Math.max(0, localX / trackWidth));
      progressSV.value = Math.round(ratio * maxPage);
      runOnJS(moveSlide)(event.absoluteX);
    })
    .onFinalize((event, success) => {
      if (success) {
        runOnJS(endSlide)(event.absoluteX);
        return;
      }
      runOnJS(cancelSlide)();
    });

  const thumbStyle = useAnimatedStyle(() => {
    const width = widthSV.value;
    const maxPage = Math.max(1, maxSV.value);
    const travel = Math.max(0, width - THUMB_SIZE);
    const x = maxSV.value <= 0 ? travel / 2 : (progressSV.value / maxPage) * travel;
    return {
      transform: [{ translateX: x }],
    };
  });

  const sections = useMemo(
    () => Array.from({ length: Math.max(1, totalPages) }, (_, index) => index),
    [totalPages],
  );

  return (
    <View style={styles.root}>
      {sliding ? (
        <View
          style={[styles.bubbleWrap, { left: `${(max <= 0 ? 0.5 : clamped / max) * 100}%` }]}
          pointerEvents='none'>
          <View style={styles.bubble}>
            <ThemedText variant='caption1' style={styles.bubbleText}>
              {clamped + 1}
            </ThemedText>
          </View>
        </View>
      ) : null}
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
          }}>
          <View style={styles.sections}>
            {sections.map((index) => (
              <View
                key={index}
                style={[
                  styles.section,
                  {
                    marginRight: index === sections.length - 1 ? 0 : SECTION_GAP,
                    backgroundColor: index <= clamped ? accentColor : 'rgba(255,255,255,0.22)',
                  },
                ]}
              />
            ))}
          </View>
          <Animated.View style={[styles.thumb, { backgroundColor: accentColor }, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: Spacing.lg,
  },
  bubbleWrap: {
    position: 'absolute',
    top: 0,
    transform: [{ translateX: -16 }],
  },
  bubble: {
    minWidth: 32,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
  },
  bubbleText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  trackHit: {
    height: 44,
    justifyContent: 'center',
  },
  sections: {
    height: TRACK_HEIGHT,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    borderRadius: 5,
  },
  section: {
    flex: 1,
    minWidth: 1,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    top: (44 - THUMB_SIZE) / 2,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
