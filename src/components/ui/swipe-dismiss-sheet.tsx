import { createContext, useCallback, useEffect, useMemo, type ComponentProps, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/use-theme";

const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;

/** Pan gesture provided by the sheet; ModalHeader attaches it so the sheet can be dragged by its header. */
export type SheetGesture = ComponentProps<typeof GestureDetector>["gesture"];
export const SwipeDismissContext = createContext<SheetGesture | null>(null);

type SwipeDismissSheetProps = {
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Bottom sheet container that follows a downward drag on its header and closes when the drag is
 * far or fast enough. The gesture root is needed because a native Modal is a separate window.
 */
export function SwipeDismissSheet({ onClose, style, children }: SwipeDismissSheetProps) {
  const { colors } = useTheme();
  // Plain number: UI-thread worklets cannot call into Dimensions.
  const screenHeight = useWindowDimensions().height;
  // The modal itself only fades (so the dimmed backdrop does not travel with the sheet);
  // the sheet slides up on its own from below the screen.
  const translateY = useSharedValue(screenHeight);

  useEffect(() => {
    translateY.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [translateY]);

  const finishClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetX([-24, 24])
        .onUpdate((event) => {
          translateY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
            translateY.value = withTiming(
              screenHeight,
              { duration: 180 },
              (finished) => {
                if (finished) runOnJS(finishClose)();
              },
            );
          } else {
            translateY.value = withSpring(0);
          }
        }),
    [translateY, screenHeight, finishClose],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    // Overlay over the whole modal with the sheet pinned to its bottom edge; box-none keeps the
    // backdrop behind it tappable.
    <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={styles.bottom} pointerEvents="box-none">
        <SwipeDismissContext.Provider value={gesture}>
          <Animated.View style={[style, animatedStyle]}>
            {children}
            <View style={styles.grabberWrap} pointerEvents="none">
              <View style={[styles.grabber, { backgroundColor: colors.tertiaryLabel }]} />
            </View>
          </Animated.View>
        </SwipeDismissContext.Provider>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  bottom: { flex: 1, justifyContent: "flex-end" },
  grabberWrap: {
    position: "absolute",
    top: 6,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  grabber: { width: 56, height: 5, borderRadius: 3, opacity: 0.6 },
});
