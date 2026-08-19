import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type InlinePillOption = {
  id: string;
  label: string;
};

type InlinePillSelectProps = {
  label: string;
  options: InlinePillOption[];
  selectedId: string;
  onSelect: (id: string) => void;
};

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();

  if (active) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole='button'
        style={[styles.chipActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}>
        <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
          {label}
        </ThemedText>
        <Ionicons name='chevron-down' size={13} color={colors.onTint} />
      </Pressable>
    );
  }

  return (
    <GlassSurface borderRadius={radius.pill} style={styles.chip} interactive>
      <Pressable style={styles.chipPressable} onPress={onPress} accessibilityRole='button'>
        <ThemedText variant='subheadline' numberOfLines={1}>
          {label}
        </ThemedText>
        <Ionicons name='chevron-down' size={13} color={colors.tertiaryLabel} />
      </Pressable>
    </GlassSurface>
  );
}

export function InlinePillSelect({ label, options, selectedId, onSelect }: InlinePillSelectProps) {
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const selectedLabel = useMemo(
    () => options.find((option) => option.id === selectedId)?.label ?? label,
    [label, options, selectedId],
  );

  return (
    <View style={styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <FilterChip label={selectedLabel} active={open} onPress={() => setOpen((value) => !value)} />
      </ScrollView>
      {open ? (
        <View style={styles.dropdown}>
          <View style={styles.pillGrid}>
            {options.map((option) => {
              const isSelected = option.id === selectedId;
              if (isSelected) {
                return (
                  <Pressable
                    key={option.id}
                    style={[styles.pillActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}
                    onPress={() => {
                      onSelect(option.id);
                      setOpen(false);
                    }}>
                    <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
                      {option.label}
                    </ThemedText>
                  </Pressable>
                );
              }

              return (
                <GlassSurface key={option.id} borderRadius={radius.pill} interactive>
                  <Pressable
                    style={styles.pill}
                    onPress={() => {
                      onSelect(option.id);
                      setOpen(false);
                    }}>
                    <ThemedText variant='subheadline' numberOfLines={1}>
                      {option.label}
                    </ThemedText>
                  </Pressable>
                </GlassSurface>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.sm,
  },
  row: {
    gap: Spacing.sm,
  },
  chip: {
    alignSelf: 'flex-start',
  },
  chipPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  chipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  dropdown: {
    paddingTop: Spacing.xs,
  },
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
