import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ParsedRating } from '@/utils/manga-description';

type StarRatingProps = {
  rating: ParsedRating;
  compact?: boolean;
};

export function StarRating({ rating, compact }: StarRatingProps) {
  const { colors } = useTheme();
  const stars: string[] = [];

  for (let index = 0; index < rating.filled; index += 1) {
    stars.push('★');
  }
  if (rating.half) {
    stars.push('✮');
  }
  for (let index = 0; index < rating.empty; index += 1) {
    stars.push('☆');
  }

  return (
    <View style={styles.row}>
      <ThemedText variant={compact ? 'caption2' : 'footnote'} style={{ color: colors.tint }}>
        {stars.join('')}
      </ThemedText>
      {rating.score ? (
        <ThemedText variant={compact ? 'caption2' : 'footnote'} color='secondaryLabel'>
          {rating.score}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
