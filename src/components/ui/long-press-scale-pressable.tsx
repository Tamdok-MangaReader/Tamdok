import * as Haptics from 'expo-haptics';
import { forwardRef, useCallback } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const SQUEEZE_SCALE = 0.96;
const SPRING = { damping: 14, stiffness: 320, mass: 0.6 };

type LongPressScalePressableProps = PressableProps & {
  squeezeOnLongPress?: boolean;
  squeezeScale?: number;
};

export const LongPressScalePressable = forwardRef<View, LongPressScalePressableProps>(
  function LongPressScalePressable(
    { onLongPress, onPressOut, onPressIn, style, squeezeOnLongPress = true, squeezeScale = SQUEEZE_SCALE, children, ...rest },
    ref,
  ) {
    const scale = useSharedValue(1);
    const nativeGesture = Gesture.Native();

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const squeeze = useCallback(() => {
      if (!squeezeOnLongPress) return;
      scale.value = withSpring(squeezeScale, SPRING);
    }, [scale, squeezeOnLongPress, squeezeScale]);

    const release = useCallback(() => {
      scale.value = withSpring(1, SPRING);
    }, [scale]);

    return (
      <GestureDetector gesture={nativeGesture}>
        <Pressable
          ref={ref}
          {...rest}
          style={style}
          onPressIn={(event) => {
            onPressIn?.(event);
          }}
          onLongPress={(event) => {
            squeeze();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onLongPress?.(event);
          }}
          onPressOut={(event) => {
            release();
            onPressOut?.(event);
          }}>
          <Reanimated.View style={animatedStyle}>{children}</Reanimated.View>
        </Pressable>
      </GestureDetector>
    );
  },
);
