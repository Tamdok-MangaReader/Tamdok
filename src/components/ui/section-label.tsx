import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';

type SectionLabelProps = {
  children: string;
  isFirst?: boolean;
  trailing?: ReactNode;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

export function SectionLabel({
  children,
  isFirst = false,
  trailing,
  style,
  containerStyle,
}: SectionLabelProps) {
  if (trailing) {
    return (
      <View style={[styles.row, isFirst ? styles.first : styles.follows, containerStyle]}>
        <ThemedText
          variant='footnote'
          color='secondaryLabel'
          style={[styles.label, styles.labelInline, style]}>
          {children}
        </ThemedText>
        {trailing}
      </View>
    );
  }

  return (
    <ThemedText
      variant='footnote'
      color='secondaryLabel'
      style={[styles.label, isFirst ? styles.first : styles.follows, style]}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.sm,
  },
  labelInline: {
    flex: 1,
  },
  first: {
    paddingTop: Spacing.xs,
  },
  follows: {
    paddingTop: Spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: Spacing.sm,
  },
});
