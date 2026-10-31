import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ListRowProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  iconBackground?: string;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
};

/** Material list item: round tonal icon container, ripple feedback, no rounded-square iOS badge. */
export function ListRow({ icon, iconBackground, label, onPress, destructive = false, showChevron = true }: ListRowProps) {
  const { colors } = useTheme();
  const accent = destructive ? colors.destructive : (iconBackground ?? colors.tint);

  return (
    <Pressable
      style={styles.row}
      android_ripple={{ color: colors.quaternaryFill }}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}>
      {icon ? (
        <View style={[styles.iconCircle, { backgroundColor: accent + '26' }]}>
          <Ionicons name={icon} size={20} color={accent} />
        </View>
      ) : null}
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
    minHeight: 56,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
});
