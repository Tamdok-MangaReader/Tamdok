import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';

type ReaderChapterBoundaryProps = {
  kind: 'start' | 'end';
  chapterLabel: string;
  nextChapterLabel?: string | null;
  previousChapterLabel?: string | null;
  foregroundColor: string;
  compact?: boolean;
  safeInset?: number;
  onPress?: () => void;
  onContinue?: () => void;
  onPrevious?: () => void;
};

export function ReaderChapterBoundary({
  kind,
  chapterLabel,
  nextChapterLabel,
  previousChapterLabel,
  foregroundColor,
  compact = false,
  safeInset = 0,
  onPress,
  onContinue,
  onPrevious,
}: ReaderChapterBoundaryProps) {
  const title = kind === 'start' ? t('reader_chapter_started', { title: chapterLabel }) : t('reader_chapter_finished', { title: chapterLabel });
  const subtitle =
    kind === 'end'
      ? nextChapterLabel
        ? t('reader_chapter_next_hint', { title: nextChapterLabel })
        : t('reader_chapter_last')
      : previousChapterLabel
        ? t('reader_chapter_previous_hint', { title: previousChapterLabel })
        : t('reader_chapter_started_hint');

  return (
    <Pressable
      onPress={kind === 'end' && onContinue && nextChapterLabel ? onContinue : kind === 'start' && onPrevious && previousChapterLabel ? onPrevious : onPress}
      style={[
        styles.root,
        compact && styles.rootCompact,
        kind === 'start' && safeInset > 0 ? { paddingTop: safeInset + Spacing.lg } : null,
        kind === 'end' && safeInset > 0 ? { paddingBottom: safeInset + Spacing.lg } : null,
      ]}
      accessibilityRole='button'>
      <View style={styles.rule} />
      <ThemedText variant='headline' style={[styles.title, { color: foregroundColor }]}>
        {title}
      </ThemedText>
      <ThemedText variant='footnote' style={[styles.subtitle, { color: foregroundColor, opacity: 0.65 }]}>
        {subtitle}
      </ThemedText>
      <View style={styles.rule} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    minHeight: 132,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  rootCompact: {
    paddingVertical: Spacing.md,
  },
  title: {
    textAlign: 'center',
    fontWeight: '700',
  },
  subtitle: {
    textAlign: 'center',
  },
  rule: {
    width: 48,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginVertical: Spacing.xs,
  },
});
