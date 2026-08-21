import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SFSymbolIcon } from '@/components/ui/sf-symbol-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useIncognitoMode } from '@/hooks/use-incognito-mode';
import { useTheme } from '@/hooks/use-theme';

export function IncognitoModeBanner({ floating = false, style }: { floating?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors, radius } = useTheme();
  const incognitoMode = useIncognitoMode();
  const insets = useSafeAreaInsets();

  if (!incognitoMode) return null;

  return (
    <View style={[floating && [styles.floatingWrap, { top: insets.top + Spacing.xs }], style]} pointerEvents={floating ? 'box-none' : undefined}>
      <View
        style={[
          styles.banner,
          floating && styles.floatingBanner,
          {
            backgroundColor: colors.secondaryFill,
            borderColor: colors.separator,
            borderRadius: radius.md,
          },
        ]}>
        <SFSymbolIcon name='eye.slash.fill' size={16} color={colors.secondaryLabel} fallback='eye-off-outline' />
        <ThemedText variant='footnote' color='secondaryLabel' style={styles.label}>
          {t('incognito_mode_active')}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  floatingBanner: {
    marginBottom: 0,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  label: {
    flex: 1,
  },
});
