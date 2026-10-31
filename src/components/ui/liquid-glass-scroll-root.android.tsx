import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

type LiquidGlassScrollRootProps = {
  children: NonNullable<React.ReactNode>;
  style?: StyleProp<ViewStyle>;
};

/** Scroll-edge blur is iOS 26 only; on Android this is a transparent passthrough. */
export function LiquidGlassScrollRoot({ children }: LiquidGlassScrollRootProps) {
  return <>{children}</>;
}

export function LiquidGlassScrollComponent(props: React.ComponentProps<typeof Animated.ScrollView>) {
  return <Animated.ScrollView {...props} />;
}
