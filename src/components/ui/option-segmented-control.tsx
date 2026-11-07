import SegmentedControl from '@react-native-segmented-control/segmented-control';
import type { ComponentType } from 'react';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type SegmentOption = { id: string; label: string };

type OptionSegmentedControlProps = {
  options: SegmentOption[];
  selectedId: string;
  onSelect: (id: string) => void;
};

// The library ships class-component typings that do not satisfy the current JSX types.
const NativeSegmented = SegmentedControl as unknown as ComponentType<{
  values: string[];
  selectedIndex: number;
  appearance: 'light' | 'dark';
  style?: object;
  onChange: (event: { nativeEvent: { selectedSegmentIndex: number } }) => void;
}>;

/** Two to four short, mutually exclusive choices (HIG segmented control). */
export function OptionSegmentedControl({ options, selectedId, onSelect }: OptionSegmentedControlProps) {
  const { isDark } = useTheme();
  const values = options.map((option) => option.label);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.id === selectedId),
  );
  const select = (index: number) => {
    const option = options[index];
    if (option) onSelect(option.id);
  };

  return (
    <NativeSegmented
      values={values}
      selectedIndex={selectedIndex}
      appearance={isDark ? 'dark' : 'light'}
      style={styles.segmented}
      onChange={(event) => select(event.nativeEvent.selectedSegmentIndex)}
    />
  );
}

const styles = StyleSheet.create({
  segmented: {
    height: 36,
  },
});
