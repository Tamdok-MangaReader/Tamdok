import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { APP_ICON_OPTIONS, THEMED_APP_ICON_OPTIONS, type AppIconId, type AppIconOption } from '@/constants/app-icons';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';

const COLUMNS = 4;
const GAP = Spacing.md;
const RING_WIDTH = 2.5;
const RING_GAP = 2;
const ICON_CORNER_RATIO = 0.2237;

type AppIconPickerProps = {
  selectedId: AppIconId;
  onSelect: (id: AppIconId) => void;
};

export function AppIconPicker({ selectedId, onSelect }: AppIconPickerProps) {
  const { colors } = useTheme();
  const [rowWidth, setRowWidth] = useState(0);
  const itemWidth = rowWidth > 0 ? (rowWidth - GAP * (COLUMNS - 1)) / COLUMNS : 72;
  const frameSize = Math.max(48, itemWidth - 8);
  const iconSize = frameSize - 2 * (RING_WIDTH + RING_GAP);
  const iconRadius = iconSize * ICON_CORNER_RATIO;

  const renderOption = (option: AppIconOption) => {
        const selected = option.id === selectedId;
    return (
      <Pressable
        key={option.id}
        accessibilityRole='button'
        accessibilityState={{ selected }}
        onPress={() => onSelect(option.id)}
        style={[styles.item, { width: itemWidth }]}>
        <View
          style={{
            width: frameSize,
            height: frameSize,
            padding: RING_GAP,
            borderWidth: RING_WIDTH,
            borderRadius: iconRadius + RING_GAP + RING_WIDTH,
            borderCurve: 'continuous',
            borderColor: selected ? colors.tint : 'transparent',
          }}>
          <Image
            source={option.preview}
            style={{ width: iconSize, height: iconSize, borderRadius: iconRadius, borderCurve: 'continuous' }}
            contentFit='cover'
          />
        </View>
        <ThemedText variant='caption2' numberOfLines={1} style={styles.label}>
          {t(option.labelKey)}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <View style={styles.sections}>
      <View style={styles.grid} onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
        {APP_ICON_OPTIONS.map(renderOption)}
      </View>
      <ThemedText variant='footnote' color='secondaryLabel'>
        {t('appearance_app_icon_themed')}
      </ThemedText>
      <View style={styles.grid}>{THEMED_APP_ICON_OPTIONS.map(renderOption)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: Spacing.md,
  },
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
  label: {
    textAlign: 'center',
  },
});
