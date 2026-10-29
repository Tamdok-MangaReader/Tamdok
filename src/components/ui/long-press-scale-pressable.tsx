import * as Haptics from 'expo-haptics';
import { forwardRef, useCallback } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const SQUEEZE_SCALE = 0.96;
const PRESS_SCALE = 0.97;
const SPRING = { damping: 14, stiffness: 320, mass: 0.6 };

type LongPressScalePressableProps = PressableProps & {
  squeezeOnLongPress?: boolean;
  squeezeScale?: number;
};

export const LongPressScalePressable = forwardRef<View, LongPressScalePressableProps>(function LongPressScalePressable(
  { onLongPress, onPress, onPressOut, onPressIn, style, squeezeOnLongPress = true, squeezeScale = SQUEEZE_SCALE, children, ...rest },
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
          if (squeezeOnLongPress) scale.value = withTiming(PRESS_SCALE, { duration: 90 });
          onPressIn?.(event);
        }}
        onPress={(event) => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.(event);
        }}
        onLongPress={
          onLongPress
            ? (event) => {
                squeeze();
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onLongPress(event);
              }
            : undefined
        }
        onPressOut={(event) => {
          release();
          onPressOut?.(event);
        }}>
        <Reanimated.View style={animatedStyle}>{children as any}</Reanimated.View>
      </Pressable>
    </GestureDetector>
  );
});
