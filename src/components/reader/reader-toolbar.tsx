import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReader } from '@/components/reader/reader-context';
import { ReaderPageSlider } from '@/components/reader/reader-page-slider';
import { ThemedText } from '@/components/ui/themed-text';
import { t } from '@/constants/locales';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ReaderToolbarProps = {
  visible: boolean;
};

export function ReaderToolbar({ visible }: ReaderToolbarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { chrome, actions, foregroundColor } = useReader();

  if (!visible) return null;

  const totalPages = Math.max(1, chrome.totalPages);

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(180)}
      style={[styles.root, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}
      pointerEvents='box-none'>
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.72)', '#000000']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents='none' />
      <View style={styles.row}>
        <ThemedText variant='footnote' style={{ color: foregroundColor }}>
          {t('reader_page_counter', { current: String(chrome.currentPage + 1), total: String(totalPages) })}
        </ThemedText>
        <ThemedText variant='footnote' color='tertiaryLabel'>
          {t('reader_pages_remaining', { count: String(Math.max(0, totalPages - chrome.currentPage - 1)) })}
        </ThemedText>
      </View>
      <ReaderPageSlider
        currentPage={chrome.currentPage}
        totalPages={totalPages}
        accentColor={colors.tint}
        labelColor={foregroundColor}
        onSeek={(page) => actions.goToPage(page, false)}
      />
      {chrome.incognito ? (
        <ThemedText variant='caption2' style={{ color: foregroundColor, textAlign: 'center' }}>
          {t('incognito_mode_active')}
        </ThemedText>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
