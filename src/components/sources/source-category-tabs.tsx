import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SourceCategoryTab = {
  id: string;
  label: string;
  count?: number;
};

type SourceCategoryTabsProps = {
  tabs: SourceCategoryTab[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function SourceCategoryTabs({ tabs, selectedId, onSelect }: SourceCategoryTabsProps) {
  const { colors, radius } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const tabOffsets = useRef<Record<string, number>>({});

  useEffect(() => {
    const offset = tabOffsets.current[selectedId];
    if (offset == null) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, offset - Spacing.lg), animated: true });
  }, [selectedId]);

  if (tabs.length <= 1) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        contentInsetAdjustmentBehavior='never'>
        {tabs.map((tab) => {
          const selected = tab.id === selectedId;
          const countLabel = tab.count == null ? undefined : tab.count > 99 ? '99+' : String(tab.count);
          const label = (
            <View style={styles.tabInner}>
              <ThemedText
                variant='subheadline'
                style={selected ? { color: colors.onTint, fontWeight: '600' } : undefined}>
                {tab.label}
              </ThemedText>
              {countLabel ? (
                <View
                  style={[
                    styles.countBadge,
                    {
                      backgroundColor: selected ? 'rgba(255,255,255,0.28)' : colors.fill,
                    },
                  ]}>
                  <ThemedText
                    variant='caption2'
                    style={{
                      color: selected ? colors.onTint : colors.secondaryLabel,
                      fontWeight: '700',
                      fontVariant: ['tabular-nums'],
                    }}>
                    {countLabel}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          );
          const tabNode = selected ? (
            <Pressable
              onPress={() => onSelect(tab.id)}
              style={[styles.tabActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}
              accessibilityRole='button'
              accessibilityState={{ selected: true }}
              accessibilityLabel={countLabel ? `${tab.label}, ${countLabel}` : tab.label}>
              {label}
            </Pressable>
          ) : (
            <GlassSurface borderRadius={radius.pill} interactive>
              <Pressable
                style={styles.tabPressable}
                onPress={() => onSelect(tab.id)}
                accessibilityRole='button'
                accessibilityState={{ selected: false }}
                accessibilityLabel={countLabel ? `${tab.label}, ${countLabel}` : tab.label}>
                {label}
              </Pressable>
            </GlassSurface>
          );

          return (
            <View
              key={tab.id}
              onLayout={(event) => {
                tabOffsets.current[tab.id] = event.nativeEvent.layout.x;
              }}>
              {tabNode}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 0,
  },
  row: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 0,
    paddingBottom: Spacing.xs,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  tabPressable: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  tabActive: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
