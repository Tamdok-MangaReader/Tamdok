import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CardProps = ViewProps & {
  children: React.ReactNode;
};

/** Material 3 filled card: large corner radius, tonal surface, no hairline borders. */
export function Card({ children, style, ...rest }: CardProps) {
  return (
    <ThemedView color='secondarySystemBackground' style={[styles.card, style]} {...rest}>
      {children}
    </ThemedView>
  );
}

/** Inset divider aligned with the row text, as in Material lists. */
export function CardSeparator() {
  const { colors, spacing } = useTheme();

  return <View style={[styles.separator, { backgroundColor: colors.separator, marginLeft: spacing.xxxl + spacing.lg }]} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginRight: Spacing.lg,
  },
});
