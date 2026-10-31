import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SectionLabelProps = {
  children: string;
  isFirst?: boolean;
  trailing?: ReactNode;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Material subheader: accent-colored label, sentence case. */
export function SectionLabel({ children, isFirst = false, trailing, style, containerStyle }: SectionLabelProps) {
  const { colors } = useTheme();
  const label = (
    <ThemedText
      variant='footnote'
      style={[styles.label, { color: colors.tint }, trailing ? styles.inline : null, style]}>
      {children}
    </ThemedText>
  );

  if (trailing) {
    return (
      <View style={[styles.row, isFirst ? styles.first : styles.follows, containerStyle]}>
        {label}
        {trailing}
      </View>
    );
  }

  return <View style={[isFirst ? styles.first : styles.follows, containerStyle]}>{label}</View>;
}

const styles = StyleSheet.create({
  label: {
    fontWeight: '600',
    letterSpacing: 0.1,
    paddingHorizontal: Spacing.lg,
  },
  inline: { flex: 1 },
  first: { paddingTop: Spacing.xs },
  follows: { paddingTop: Spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: Spacing.sm,
  },
});
