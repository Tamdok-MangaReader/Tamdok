import React, { useCallback, useMemo } from 'react';
import { type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset, useSharedValue } from 'react-native-reanimated';

import { ScrollWindowContext, type ScrollWindow } from '@/components/ui/scroll-window.android';

type LiquidGlassScrollRootProps = {
  children: NonNullable<React.ReactNode>;
  style?: StyleProp<ViewStyle>;
};

/** Scroll-edge blur is iOS 26 only; on Android this is a transparent passthrough. */
export function LiquidGlassScrollRoot({ children }: LiquidGlassScrollRootProps) {
  return <>{children}</>;
}

/**
 * Animated ScrollView that also publishes its scroll offset and viewport height, so rows rendered by
 * VirtualRows can be mounted/unmounted around the viewport (windowing).
 */
export function LiquidGlassScrollComponent(props: React.ComponentProps<typeof Animated.ScrollView>) {
  const { onLayout, ...rest } = props;
  const ref = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollOffset(ref);
  const viewportHeight = useSharedValue(0);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeight.value = event.nativeEvent.layout.height;
      (onLayout as ((e: LayoutChangeEvent) => void) | undefined)?.(event);
    },
    [onLayout, viewportHeight],
  );

  const windowState = useMemo<ScrollWindow>(
    () => ({ scrollY, viewportHeight, getNode: () => ref.current }),
    [scrollY, viewportHeight, ref],
  );

  return (
    <ScrollWindowContext.Provider value={windowState}>
      <Animated.ScrollView {...rest} ref={ref} onLayout={handleLayout} />
    </ScrollWindowContext.Provider>
  );
}
