import { Pressable, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { ACCENT_PRESETS, type AccentColorId } from '@/constants/accent-colors';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';

const COLUMNS = 6;
const GAP = Spacing.md;

type AccentColorPickerProps = {
  selectedId: AccentColorId;
  onSelect: (id: AccentColorId) => void;
};

export function AccentColorPicker({ selectedId, onSelect }: AccentColorPickerProps) {
  const { colors, radius } = useTheme();
  const [rowWidth, setRowWidth] = useState(0);
  const itemSize = rowWidth > 0 ? (rowWidth - GAP * (COLUMNS - 1)) / COLUMNS : 44;
  const swatchSize = Math.max(28, itemSize - 8);

  return (
    <View style={styles.grid} onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
      {ACCENT_PRESETS.map((preset) => {
        const selected = preset.id === selectedId;
        return (
          <Pressable
            key={preset.id}
            accessibilityRole='button'
            accessibilityState={{ selected }}
            accessibilityLabel={t(preset.labelKey)}
            onPress={() => onSelect(preset.id)}
            style={[styles.item, { width: itemSize, height: itemSize }]}>
            <View
              style={[
                styles.swatch,
                {
                  width: swatchSize,
                  height: swatchSize,
                  backgroundColor: preset.swatch,
                  borderRadius: radius.pill,
                  borderColor: selected ? colors.label : 'transparent',
                },
              ]}
            />
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
    justifyContent: 'center',
  },
  swatch: {
    borderWidth: 2,
  },
});
