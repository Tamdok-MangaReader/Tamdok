import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Spacing } from '@/constants/theme';

const DISMISS_SPRING = { damping: 22, stiffness: 320, mass: 0.85 };
const DISMISS_OFFSET = 120;

type SearchDismissRowProps = {
  visible: boolean;
  searchActive: boolean;
  children: ReactNode;
};

export function SearchDismissRow({ visible, searchActive, children }: SearchDismissRowProps) {
  const progress = useSharedValue(1);

  useEffect(() => {
    if (!searchActive) {
      progress.value = 1;
      return;
    }
    progress.value = withSpring(visible ? 1 : 0, DISMISS_SPRING);
  }, [visible, searchActive, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p,
      transform: [{ translateX: interpolate(p, [0, 1], [DISMISS_OFFSET, 0]) }],
      maxHeight: interpolate(p, [0, 1], [0, 320]),
      overflow: 'hidden' as const,
      marginBottom: p > 0.05 ? Spacing.sm : 0,
    };
  });

  if (!searchActive) {
    return <View style={styles.root}>{children}</View>;
  }

  return (
    <Animated.View style={[styles.root, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
});
