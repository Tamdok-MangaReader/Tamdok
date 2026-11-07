import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';

/** Explanatory text shown under a card, aligned with the section label above it. */
export function SectionFooter({ children, spaced = false }: { children: string; spaced?: boolean }) {
  return (
    <ThemedText variant='footnote' color='secondaryLabel' style={[styles.footer, spaced && styles.spaced]}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: Spacing.sm,
  },
  // For footers followed by a card instead of a section label, which already adds its own top spacing.
  spaced: {
    marginBottom: Spacing.lg,
  },
});
