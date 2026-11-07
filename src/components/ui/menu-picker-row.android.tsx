import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type MenuPickerOption = { id: string; label: string };

type MenuPickerRowProps = {
  label: string;
  options: MenuPickerOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  isFirst?: boolean;
  isLast?: boolean;
};

/** Android fallback: the row expands in place into a list of options. */
export function MenuPickerRow({ label, options, selectedId, onSelect }: MenuPickerRowProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.id === selectedId)?.label ?? '';

  return (
    <View>
      <Pressable
        style={styles.row}
        onPress={() => setOpen((value) => !value)}
        accessibilityRole='button'
        accessibilityState={{ expanded: open }}>
        <ThemedText variant='body' style={styles.label}>
          {label}
        </ThemedText>
        <ThemedText variant='body' color='tint' numberOfLines={1}>
          {current}
        </ThemedText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.tertiaryLabel} />
      </Pressable>
      {open
        ? options.map((option) => (
            <Pressable
              key={option.id}
              style={styles.option}
              onPress={() => {
                onSelect(option.id);
                setOpen(false);
              }}
              accessibilityRole='button'>
              <ThemedText variant='body' style={styles.label}>
                {option.label}
              </ThemedText>
              {option.id === selectedId ? <Ionicons name='checkmark' size={20} color={colors.tint} /> : null}
            </Pressable>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    minHeight: 48,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.xxl,
    paddingRight: Spacing.lg,
    minHeight: 44,
  },
  label: {
    flex: 1,
  },
});
