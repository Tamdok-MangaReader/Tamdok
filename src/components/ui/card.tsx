import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CardProps = ViewProps & {
  children: React.ReactNode;
};

export function Card({ children, style, ...rest }: CardProps) {
  const { radius } = useTheme();

  return (
    <ThemedView color='secondarySystemBackground' style={[styles.card, { borderRadius: radius.md }, style]} {...rest}>
      {children}
    </ThemedView>
  );
}

export function CardSeparator() {
  const { colors, spacing } = useTheme();

  return <View style={[styles.separator, { backgroundColor: colors.separator, marginLeft: spacing.xxxl + spacing.lg }]} />;
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginRight: Spacing.lg,
  },
});
