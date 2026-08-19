import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/ui/themed-text';
import { t } from '@/constants/locales';
import type { ResolvedReadingMode } from '@/services/app-settings';

type ReaderModeHintProps = {
  mode: ResolvedReadingMode;
};

function hintForMode(mode: ResolvedReadingMode): {
  icons: Array<keyof typeof Ionicons.glyphMap>;
  label: string;
  stack: 'row' | 'column';
} {
  switch (mode) {
    case 'ltr':
      return { icons: ['chevron-forward', 'chevron-forward'], label: t('reader_mode_hint_ltr'), stack: 'row' };
    case 'vertical':
      return { icons: ['chevron-down', 'chevron-down'], label: t('reader_mode_hint_vertical'), stack: 'column' };
    case 'webtoon':
    case 'continuous':
      return { icons: ['chevron-down', 'chevron-down'], label: t('reader_mode_hint_continuous'), stack: 'column' };
    case 'rtl':
    default:
      return { icons: ['chevron-back', 'chevron-back'], label: t('reader_mode_hint_rtl'), stack: 'row' };
  }
}

export function ReaderModeHint({ mode }: ReaderModeHintProps) {
  const hint = hintForMode(mode);

  return (
    <Animated.View
      key={mode}
      pointerEvents='none'
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(280)}
      style={styles.wrap}>
      <View style={styles.badge}>
        <View style={[styles.icons, hint.stack === 'column' ? styles.iconsColumn : null]}>
          {hint.icons.map((name, index) => (
            <Ionicons
              key={`${name}:${index}`}
              name={name}
              size={36}
              color='#FFFFFF'
              style={
                hint.stack === 'column'
                  ? index === 0
                    ? styles.iconLeadDown
                    : styles.iconTrailDown
                  : index === 0
                    ? styles.iconLead
                    : styles.iconTrail
              }
            />
          ))}
        </View>
        <ThemedText variant='subheadline' style={styles.label}>
          {hint.label}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  badge: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 22,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconsColumn: {
    flexDirection: 'column',
  },
  iconLead: {
    marginRight: -10,
    opacity: 0.55,
  },
  iconTrail: {
    opacity: 1,
  },
  iconLeadDown: {
    marginBottom: -14,
    opacity: 0.55,
  },
  iconTrailDown: {
    opacity: 1,
  },
  label: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
