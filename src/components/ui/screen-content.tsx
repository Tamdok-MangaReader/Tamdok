import React from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { LiquidGlassScrollRoot } from '@/components/ui/liquid-glass-scroll-root';
import { ThemedView } from '@/components/ui/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenContentProps = Omit<ScrollViewProps, 'contentContainerStyle'> & {
  children: React.ReactNode;
  padded?: boolean;
  centerContent?: boolean;
  scrollable?: boolean;
  keyboardAware?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function ScreenContent({
  children,
  padded = true,
  centerContent = false,
  scrollable,
  keyboardAware = false,
  contentContainerStyle,
  style,
  ...rest
}: ScreenContentProps) {
  const { isGlass } = useTheme();
  const usesScrollView = scrollable ?? !centerContent;
  const ScrollComponent = keyboardAware ? KeyboardAwareScrollView : ScrollView;
  const scrollProps = keyboardAware
    ? { keyboardShouldPersistTaps: 'handled' as const, bottomOffset: Spacing.lg }
    : {};

  if (!usesScrollView) {
    return (
      <ThemedView color='groupedBackground' style={styles.root}>
        <View
          style={[
            centerContent ? styles.centeredBody : styles.staticBody,
            padded && styles.padded,
            contentContainerStyle,
            style,
          ]}>
          {children}
        </View>
      </ThemedView>
    );
  }

  const scrollView = (
    <ScrollComponent
      {...(!keyboardAware ? { bounces: isGlass } : {})}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior='automatic'
      automaticallyAdjustsScrollIndicatorInsets
      style={style}
      contentContainerStyle={[styles.content, padded && styles.padded, contentContainerStyle]}
      {...scrollProps}
      {...rest}>
      {children}
    </ScrollComponent>
  );

  if (keyboardAware) {
    return (
      <ThemedView color='groupedBackground' style={styles.root}>
        {scrollView}
      </ThemedView>
    );
  }

  return (
    <ThemedView color='groupedBackground' style={styles.root}>
      <LiquidGlassScrollRoot style={styles.root}>{scrollView}</LiquidGlassScrollRoot>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: Spacing.sm,
    paddingBottom: BottomTabInset + Spacing.lg,
  },
  staticBody: {
    flex: 1,
    gap: Spacing.sm,
  },
  centeredBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingBottom: BottomTabInset,
  },
  padded: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
});
