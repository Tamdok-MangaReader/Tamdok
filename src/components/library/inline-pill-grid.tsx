import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type InlinePillOption = {
  id: string;
  label: string;
};

type InlinePillGridProps = {
  options: InlinePillOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Keep option order fixed; selected pill stays in place instead of moving first. */
  preserveOrder?: boolean;
};

export function InlinePillGrid({ options, selectedId, onSelect, preserveOrder = false }: InlinePillGridProps) {
  const { colors, radius } = useTheme();

  const orderedOptions = useMemo(() => {
    if (preserveOrder) return options;
    const selected = options.find((option) => option.id === selectedId);
    if (!selected) return options;
    return [selected, ...options.filter((option) => option.id !== selectedId)];
  }, [options, preserveOrder, selectedId]);

  return (
    <View style={styles.pillGrid}>
      {orderedOptions.map((option) => {
        const isSelected = option.id === selectedId;
        if (isSelected) {
          return (
            <Pressable
              key={option.id}
              style={[styles.pillActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}
              onPress={() => onSelect(option.id)}
              accessibilityRole='button'
              accessibilityState={{ selected: true }}>
              <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        }

        return (
          <GlassSurface key={option.id} borderRadius={radius.pill} interactive>
            <Pressable style={styles.pill} onPress={() => onSelect(option.id)} accessibilityRole='button'>
              <ThemedText variant='subheadline' numberOfLines={1}>
                {option.label}
              </ThemedText>
            </Pressable>
          </GlassSurface>
        );
      })}
    </View>
  );
}

type InlinePillToggleGridProps = {
  options: InlinePillOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
};

export function InlinePillToggleGrid({ options, selectedIds, onToggle }: InlinePillToggleGridProps) {
  const { colors, radius } = useTheme();

  const orderedOptions = useMemo(() => {
    const selected = options.filter((option) => selectedIds.includes(option.id));
    const unselected = options.filter((option) => !selectedIds.includes(option.id));
    return [...selected, ...unselected];
  }, [options, selectedIds]);

  return (
    <View style={styles.pillGrid}>
      {orderedOptions.map((option) => {
        const isSelected = selectedIds.includes(option.id);
        if (isSelected) {
          return (
            <Pressable
              key={option.id}
              style={[styles.pillActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}
              onPress={() => onToggle(option.id)}
              accessibilityRole='button'
              accessibilityState={{ selected: true }}>
              <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        }

        return (
          <GlassSurface key={option.id} borderRadius={radius.pill} interactive>
            <Pressable style={styles.pill} onPress={() => onToggle(option.id)} accessibilityRole='button'>
              <ThemedText variant='subheadline' numberOfLines={1}>
                {option.label}
              </ThemedText>
            </Pressable>
          </GlassSurface>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pillActive: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});
