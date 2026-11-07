import { Host, Image as SwiftImage, Slider } from '@expo/ui/swift-ui';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type GridColumnsSliderProps = {
  value: number;
  max: number;
  onChange: (value: number) => void;
};

/** Native stepped slider for the library grid density, with the current value above it. */
export function GridColumnsSlider({ value, max, onChange }: GridColumnsSliderProps) {
  const { isDark } = useTheme();
  // The value is committed when the finger lifts: every step would otherwise rewrite settings and re-layout the library grid.
  const [local, setLocal] = useState(value);
  const editing = useRef(false);
  const latest = useRef(value);

  useEffect(() => {
    if (!editing.current) {
      setLocal(value);
      latest.current = value;
    }
  }, [value]);

  return (
    <View style={styles.root}>
      <ThemedText variant='title2' style={styles.value}>
        {local}
      </ThemedText>
      <Host style={styles.slider} colorScheme={isDark ? 'dark' : 'light'}>
        <Slider
          value={local}
          min={1}
          max={max}
          step={1}
          minimumValueLabel={<SwiftImage systemName='square' />}
          maximumValueLabel={<SwiftImage systemName='square.grid.3x3' />}
          onValueChange={(next: number) => {
            const rounded = Math.round(next);
            latest.current = rounded;
            setLocal(rounded);
          }}
          onEditingChanged={(isEditing: boolean) => {
            editing.current = isEditing;
            if (!isEditing && latest.current !== value) onChange(latest.current);
          }}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  value: {
    textAlign: 'center',
    fontWeight: '600',
  },
  slider: {
    height: 44,
  },
});
