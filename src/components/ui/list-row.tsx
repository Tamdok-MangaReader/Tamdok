import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ListRowProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
};

export function ListRow({ icon, label, onPress, destructive = false, showChevron = true, isFirst, isLast }: ListRowProps) {
  const { colors, radius, spacing } = useTheme();
  const iconColor = destructive ? colors.destructive : colors.tint;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
        pressed && { backgroundColor: colors.quaternaryFill },
        isFirst && { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, paddingTop: spacing.lg },
        isLast && { borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, paddingBottom: spacing.lg },
      ]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}>
      {icon && <Ionicons name={icon} size={22} color={iconColor} style={styles.icon} />}
      <ThemedText variant='body' color={destructive ? 'destructive' : 'label'} style={styles.label}>
        {label}
      </ThemedText>
      {showChevron && onPress && <Ionicons name='chevron-forward' size={18} color={colors.tertiaryLabel} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  icon: {
    width: 24,
    textAlign: 'center',
  },
  label: {
    flex: 1,
  },
});
