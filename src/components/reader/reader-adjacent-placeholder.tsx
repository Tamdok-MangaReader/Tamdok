import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useReader } from '@/components/reader/reader-context';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';

type Props = {
  direction: 'previous' | 'next';
  foregroundColor: string;
};

// Shown where the neighbouring chapter will appear. A spinner while it loads; if loading failed
// (no connection and the chapter is not downloaded, timeout) a message with a retry button instead.
export function ReaderAdjacentPlaceholder({ direction, foregroundColor }: Props) {
  const { adjacentFailed, actions } = useReader();
  if (!adjacentFailed[direction]) return <ActivityIndicator color={foregroundColor} />;

  return (
    <View style={styles.root}>
      <ThemedText variant="subheadline" style={[styles.message, { color: foregroundColor }]}>
        {t('reader_adjacent_failed')}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={() => actions.retryAdjacentChapter(direction)}
        style={[styles.button, { borderColor: foregroundColor }]}
      >
        <ThemedText variant="subheadline" style={{ color: foregroundColor }}>
          {t('reader_image_retry')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  message: { textAlign: 'center', opacity: 0.8 },
  button: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
});
