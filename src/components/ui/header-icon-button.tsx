import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const ICON_SIZE = 22;

type HeaderIconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export function HeaderIconButton({ icon, onPress, accessibilityLabel }: HeaderIconButtonProps) {
  const { colors } = useTheme();
  const iconNode = <Ionicons name={icon} size={ICON_SIZE} color={colors.tint} />;

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={12} style={styles.button} accessibilityRole='button' accessibilityLabel={accessibilityLabel}>
        {iconNode}
      </Pressable>
    );
  }

  return (
    <View style={styles.button} accessibilityRole='button' accessibilityLabel={accessibilityLabel}>
      {iconNode}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
