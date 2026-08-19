import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { APP_ICON_OPTIONS, type AppIconId } from '@/constants/app-icons';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';

const COLUMNS = 4;
const GAP = Spacing.md;

type AppIconPickerProps = {
  selectedId: AppIconId;
  onSelect: (id: AppIconId) => void;
};

export function AppIconPicker({ selectedId, onSelect }: AppIconPickerProps) {
  const { colors, radius } = useTheme();
  const [rowWidth, setRowWidth] = useState(0);
  const itemWidth = rowWidth > 0 ? (rowWidth - GAP * (COLUMNS - 1)) / COLUMNS : 72;
  const iconSize = Math.max(48, itemWidth - 8);

  return (
    <View style={styles.grid} onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
      {APP_ICON_OPTIONS.map((option) => {
        const selected = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            accessibilityRole='button'
            accessibilityState={{ selected }}
            onPress={() => onSelect(option.id)}
            style={[styles.item, { width: itemWidth }]}>
            <View
              style={[
                styles.iconFrame,
                {
                  width: iconSize,
                  height: iconSize,
                  borderRadius: radius.md,
                  borderColor: selected ? colors.tint : colors.separator,
                  backgroundColor: colors.secondarySystemBackground,
                },
              ]}>
              <Image source={option.preview} style={styles.icon} contentFit='cover' />
            </View>
            <ThemedText variant='caption2' numberOfLines={1} style={styles.label}>
              {t(option.labelKey)}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: GAP,
    rowGap: GAP,
    width: '100%',
  },
  item: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconFrame: {
    overflow: 'hidden',
    borderWidth: 2,
  },
  icon: {
    width: '100%',
    height: '100%',
  },
  label: {
    textAlign: 'center',
  },
});
