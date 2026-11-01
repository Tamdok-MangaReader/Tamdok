import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2;
const EPSILON = 0.01;

type WebtoonZoomApi = {
  /** Worklet (runs on the UI thread): toggles zoom of the whole reader around the tapped point (screen coordinates). */
  toggleZoomAt: (screenX: number, screenY: number) => void;
};

export const WebtoonZoomContext = createContext<WebtoonZoomApi | null>(null);

/**
 * Zooms the whole webtoon strip (not a single page). The strip keeps scrolling natively; a horizontal
 * drag pans sideways while zoomed, and a pinch zooms around the fingers.
 */
type WebtoonZoomProps = {
  children: ReactNode;
  /** Scrolls the list by `dy` list units (called while dragging a zoomed view). */
  onScrollBy: (dy: number) => void;
  /** Continues the scroll after a drag ends; velocity in list units per second. */
  onFling: (velocity: number) => void;
  /** True while a pinch or a zoom is active; the list's own scrolling should be disabled then. */
  onLockChange: (locked: boolean) => void;
  /** Called (on the JS thread) when a double tap toggles the zoom. */
  onDoubleTap?: () => void;
};

export function WebtoonZoom({ children, onScrollBy, onFling, onLockChange, onDoubleTap }: WebtoonZoomProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const viewWidth = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const panLastX = useSharedValue(0);
  const panLastY = useSharedValue(0);
  const pinching = useSharedValue(false);
  const pinchEndedAt = useSharedValue(0);
  const ignoringPan = useSharedValue(false);
  const rootRef = useRef<{
    measureInWindow: (cb: (x: number, y: number) => void) => void;
  } | null>(null);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewWidth.value = event.nativeEvent.layout.width;
      viewHeight.value = event.nativeEvent.layout.height;
      rootRef.current?.measureInWindow((x: number, y: number) => {
        originX.value = x;
        originY.value = y;
      });
    },
    [originX, originY, viewHeight, viewWidth],
  );

  const [zoomed, setZoomed] = useState(false);
  useAnimatedReaction(
    () => scale.value > MIN_SCALE + EPSILON,
    (value, previous) => {
      if (value !== previous) runOnJS(setZoomed)(value);
    },
  );

  // Without this the list also scrolls from the pinch's finger movement and drifts after release.
  useAnimatedReaction(
    () => pinching.value || scale.value > MIN_SCALE + EPSILON,
    (locked, previous) => {
      if (locked !== previous) runOnJS(onLockChange)(locked);
    },
  );

  const toggleZoomAt = useCallback(
    (screenX: number, screenY: number) => {
      "worklet";
      if (onDoubleTap) runOnJS(onDoubleTap)();
      if (scale.value > MIN_SCALE + EPSILON) {
        scale.value = withTiming(MIN_SCALE);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = MIN_SCALE;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }
      const target = DOUBLE_TAP_SCALE;
      const cx = viewWidth.value / 2;
      const cy = viewHeight.value / 2;
      const maxX = ((target - 1) * viewWidth.value) / 2;
      const maxY = ((target - 1) * viewHeight.value) / 2;
      const tx = Math.min(maxX, Math.max(-maxX, (1 - target) * (screenX - originX.value - cx)));
      const ty = Math.min(maxY, Math.max(-maxY, (1 - target) * (screenY - originY.value - cy)));
      scale.value = withTiming(target);
      translateX.value = withTiming(tx);
      translateY.value = withTiming(ty);
      savedScale.value = target;
      savedTranslateX.value = tx;
      savedTranslateY.value = ty;
    },
    [
      onDoubleTap,
      originX,
      originY,
      savedScale,
      savedTranslateX,
      savedTranslateY,
      scale,
      translateX,
      translateY,
      viewHeight,
      viewWidth,
    ],
  );

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart((event) => {
        pinching.value = true;
        savedScale.value = scale.value;
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        focalX.value = event.focalX;
        focalY.value = event.focalY;
      })
      .onUpdate((event) => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * event.scale));
        const ratio = next / savedScale.value;
        const cx = viewWidth.value / 2;
        const cy = viewHeight.value / 2;
        const maxX = ((next - 1) * viewWidth.value) / 2;
        const maxY = ((next - 1) * viewHeight.value) / 2;
        // Keep the point under the fingers fixed while scaling about the view center.
        const tx =
          savedTranslateX.value +
          (1 - ratio) * (focalX.value - cx - savedTranslateX.value) +
          (event.focalX - focalX.value);
        const ty =
          savedTranslateY.value +
          (1 - ratio) * (focalY.value - cy - savedTranslateY.value) +
          (event.focalY - focalY.value);
        scale.value = next;
        translateX.value = Math.min(maxX, Math.max(-maxX, tx));
        translateY.value = Math.min(maxY, Math.max(-maxY, ty));
      })
      .onFinalize(() => {
        pinching.value = false;
        pinchEndedAt.value = Date.now();
      })
      .onEnd(() => {
        if (scale.value > MIN_SCALE + EPSILON) {
          savedScale.value = scale.value;
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
          return;
        }
        scale.value = withTiming(MIN_SCALE);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = MIN_SCALE;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      });

    // While zoomed the drag is handled here in both directions: sideways it moves the view, vertically
    // it scrolls the list by the matching distance (the list's own scrolling is locked meanwhile).
    // Only exists while zoomed, so at normal scale a single-finger tap never meets this recognizer.
    const pan = Gesture.Pan()
      .enabled(zoomed)
      .maxPointers(1)
      .minDistance(6)
      .onStart((event) => {
        panLastX.value = event.translationX;
        panLastY.value = event.translationY;
        // The finger left over after a pinch must not turn into a pan.
        ignoringPan.value = Date.now() - pinchEndedAt.value < 300 || pinching.value;
      })
      .onUpdate((event) => {
        const deltaX = event.translationX - panLastX.value;
        const deltaY = event.translationY - panLastY.value;
        panLastX.value = event.translationX;
        panLastY.value = event.translationY;
        if (ignoringPan.value || scale.value <= MIN_SCALE + EPSILON) return;
        const maxX = ((scale.value - 1) * viewWidth.value) / 2;
        translateX.value = Math.min(maxX, Math.max(-maxX, translateX.value + deltaX));
        savedTranslateX.value = translateX.value;
        // On screen the content moves `scale` times faster than the list offset changes.
        runOnJS(onScrollBy)(-deltaY / scale.value);
      })
      .onEnd((event) => {
        if (ignoringPan.value || scale.value <= MIN_SCALE + EPSILON) return;
        runOnJS(onFling)(-event.velocityY / scale.value);
      });

    return Gesture.Simultaneous(pinch, pan);
  }, [
    zoomed,
    focalX,
    focalY,
    panLastX,
    panLastY,
    pinchEndedAt,
    ignoringPan,
    onScrollBy,
    onFling,
    pinching,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
    viewHeight,
    viewWidth,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const api = useMemo<WebtoonZoomApi>(() => ({ toggleZoomAt }), [toggleZoomAt]);

  return (
    <WebtoonZoomContext.Provider value={api}>
      {/* The detector sits on the static view: on the scaled one, touch coordinates would be
          remapped by the very transform being changed, which made pinch and pan drift. */}
      <GestureDetector gesture={gesture}>
        <View ref={rootRef as never} style={styles.root} onLayout={handleLayout} collapsable={false}>
          <Animated.View style={[styles.root, animatedStyle]}>{children}</Animated.View>
        </View>
      </GestureDetector>
    </WebtoonZoomContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
