import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

type GlassSegmentedControlProps = {
  values: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  style?: StyleProp<ViewStyle>;
};

/** Material 3 segmented button: outlined pill, selected segment is tonal with a check mark. */
export function GlassSegmentedControl({ values, selectedIndex, onChange, style }: GlassSegmentedControlProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.track, { borderColor: colors.opaqueSeparator }, style]}>
      {values.map((value, index) => {
        const selected = index === selectedIndex;
        return (
          <Pressable
            key={value}
            style={[
              styles.segment,
              index > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.opaqueSeparator },
              selected && { backgroundColor: colors.tint + '33' },
            ]}
            android_ripple={{ color: colors.quaternaryFill }}
            onPress={() => onChange(index)}
            accessibilityRole='button'
            accessibilityState={{ selected }}>
            {selected ? <Ionicons name='checkmark' size={16} color={colors.tint} /> : null}
            <ThemedText variant='subheadline' color={selected ? 'tint' : 'label'} numberOfLines={1}>
              {value}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
});
