import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { GlassSurface } from '@/components/ui/glass-surface';
import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

type GlassSegmentedControlProps = {
  values: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  style?: StyleProp<ViewStyle>;
};

const TRACK_PADDING = 2;
const TRACK_HEIGHT = 34;
const SPRING = { stiffness: 420, damping: 32 };

/**
 * Segmented control with Liquid Glass track, draggable thumb, and app tint color.
 */
export function GlassSegmentedControl({ values, selectedIndex, onChange, style }: GlassSegmentedControlProps) {
  const { colors, radius, isGlass } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const segmentCount = values.length;
  const innerWidth = Math.max(trackWidth - TRACK_PADDING * 2, 0);
  const segmentWidth = segmentCount > 0 ? innerWidth / segmentCount : 0;

  const thumbX = useSharedValue(0);
  const dragStartX = useSharedValue(0);

  useEffect(() => {
    if (segmentWidth > 0) {
      thumbX.value = withSpring(selectedIndex * segmentWidth, SPRING);
    }
  }, [selectedIndex, segmentWidth, thumbX]);

  const selectIndex = (index: number) => {
    onChange(Math.max(0, Math.min(segmentCount - 1, index)));
  };

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      dragStartX.value = thumbX.value;
    })
    .onUpdate((event) => {
      if (segmentWidth <= 0) return;
      const maxX = (segmentCount - 1) * segmentWidth;
      thumbX.value = Math.min(maxX, Math.max(0, dragStartX.value + event.translationX));
    })
    .onEnd(() => {
      if (segmentWidth <= 0) return;
      runOnJS(selectIndex)(Math.round(thumbX.value / segmentWidth));
    });

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: thumbX.value }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const body = (
    <View style={styles.inner} onLayout={onLayout}>
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.thumbSlot,
            { top: TRACK_PADDING, bottom: TRACK_PADDING, left: TRACK_PADDING },
            thumbAnimatedStyle,
          ]}>
          <View style={[styles.thumb, { borderRadius: radius.pill, backgroundColor: colors.tint }]} />
        </Animated.View>
      ) : null}

      <GestureDetector gesture={panGesture}>
        <View style={styles.segments}>
          {values.map((value, index) => (
            <Pressable
              key={value}
              style={styles.segment}
              onPress={() => selectIndex(index)}
              accessibilityRole='button'
              accessibilityState={{ selected: selectedIndex === index }}>
              <ThemedText variant='subheadline' color={selectedIndex === index ? 'onTint' : 'label'}>
                {value}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </GestureDetector>
    </View>
  );

  if (isGlass) {
    return (
      <GlassSurface borderRadius={radius.pill} style={[styles.track, style]} interactive>
        {body}
      </GlassSurface>
    );
  }

  return (
    <View
      style={[
        styles.track,
        styles.fallbackTrack,
        { backgroundColor: colors.tertiaryFill, borderRadius: radius.pill },
        style,
      ]}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
  },
  fallbackTrack: {
    padding: TRACK_PADDING,
  },
  inner: {
    height: TRACK_HEIGHT,
    position: 'relative',
  },
  thumbSlot: {
    position: 'absolute',
  },
  thumb: {
    flex: 1,
  },
  segments: {
    flex: 1,
    flexDirection: 'row',
    zIndex: 1,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
