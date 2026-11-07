import { HStack, Host, Picker, Spacer, Text } from '@expo/ui/swift-ui';
import { font, foregroundStyle, labelsHidden, pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet, View } from 'react-native';

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

/** Settings row "Title … value ⌃⌄": a native pull-down menu with a checkmark on the current choice. */
export function MenuPickerRow({ label, options, selectedId, onSelect, isFirst, isLast }: MenuPickerRowProps) {
  const { isDark, colors } = useTheme();

  return (
    <View
      style={[
        styles.row,
        isFirst && { paddingTop: Spacing.sm },
        isLast && { paddingBottom: Spacing.sm },
      ]}>
      {/* Label and picker share one SwiftUI stack, so their vertical alignment never depends on RN layout. */}
      <Host
        colorScheme={isDark ? 'dark' : 'light'}
        alignment='leading'
        // In a sheet the host can overlap the bottom safe area, which would push the centered content up.
        ignoreSafeArea='all'
        style={styles.host}>
        <HStack alignment='center' spacing={8}>
          <Text modifiers={[font({ textStyle: 'body' }), foregroundStyle(colors.label)]}>{label}</Text>
          <Spacer />
          <Picker
            label={label}
            selection={selectedId}
            onSelectionChange={(value: string) => onSelect(value)}
            modifiers={[pickerStyle('menu'), labelsHidden(), tint(colors.tint)]}>
            {options.map((option) => (
              <Text key={option.id} modifiers={[tag(option.id)]}>
                {option.label}
              </Text>
            ))}
          </Picker>
        </HStack>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight: 44,
  },
  label: {
    flex: 1,
  },
  // Fixed row height: the picker is centered by the host itself instead of depending on its measured size.
  host: {
    flex: 1,
    height: 44,
  },
});
