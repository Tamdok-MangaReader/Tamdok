import React from 'react';
import { ScrollView, StyleSheet, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { ScrollViewMarker } from 'react-native-screens/experimental';

import { useTheme } from '@/hooks/use-theme';
import { liquidGlassScrollEdgeEffects } from '@/utils/glass';

type LiquidGlassScrollRootProps = {
  children: NonNullable<React.ReactNode>;
  style?: StyleProp<ViewStyle>;
};

/**
 * Wraps a React Native ScrollView for iOS 26+ liquid glass scroll-edge blur.
 * The child must be a plain `ScrollView` from `react-native` — not FlatList or RNGH lists.
 */
export function LiquidGlassScrollRoot({ children, style }: LiquidGlassScrollRootProps) {
  const { isGlass } = useTheme();

  if (!isGlass) {
    return <>{children}</>;
  }

  return (
    <ScrollViewMarker scrollEdgeEffects={liquidGlassScrollEdgeEffects} style={[styles.root, style]}>
      {children}
    </ScrollViewMarker>
  );
}

/** Use as FlatList / DraggableFlatList `renderScrollComponent` for the same header gradient. */
export function LiquidGlassScrollComponent(props: ScrollViewProps) {
  const { isGlass } = useTheme();

  if (!isGlass) {
    return <ScrollView {...props} />;
  }

  return (
    <ScrollViewMarker scrollEdgeEffects={liquidGlassScrollEdgeEffects} style={styles.root}>
      <ScrollView {...props} />
    </ScrollViewMarker>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
