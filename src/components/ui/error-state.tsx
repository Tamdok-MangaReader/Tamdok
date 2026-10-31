import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';

export type ErrorKind = 'offline' | 'timeout' | 'generic';

// Picks an icon/title from the error text. Our own messages are matched by exact text; raw
// errors from sources or the network layer are matched by common phrases.
export function classifyError(message: string): ErrorKind {
  if (message === t('reader_offline_chapter')) return 'offline';
  if (message === t('reader_load_timeout')) return 'timeout';
  if (/network request failed|no internet|offline|not connected|ENOTFOUND|failed to fetch/i.test(message)) return 'offline';
  if (/timed? ?out|timeout|did not respond/i.test(message)) return 'timeout';
  return 'generic';
}

const KINDS: Record<ErrorKind, { icon: keyof typeof Ionicons.glyphMap; title: () => string }> = {
  offline: { icon: 'cloud-offline-outline', title: () => t('reader_offline_title') },
  timeout: { icon: 'time-outline', title: () => t('error_title_timeout') },
  generic: { icon: 'alert-circle-outline', title: () => t('error_title_generic') },
};

type ErrorStateProps = {
  message: string;
  kind?: ErrorKind;
  onRetry?: () => void;
  retryLabel?: string;
  // Fixed light text for screens with a forced black background (the reader).
  onDark?: boolean;
  // Small inline variant for result cards.
  compact?: boolean;
  children?: React.ReactNode;
};

export function ErrorState({ message, kind, onRetry, retryLabel, onDark, compact, children }: ErrorStateProps) {
  const { colors, radius } = useTheme();
  const resolved = KINDS[kind ?? classifyError(message)];
  const accent = onDark ? '#FF9F0A' : colors.tint;
  const primary = onDark ? '#FFFFFF' : colors.label;
  const secondary = onDark ? 'rgba(255,255,255,0.65)' : colors.secondaryLabel;

  return (
    <View style={[styles.container, compact && styles.compact]}>
      <View
        style={[
          styles.iconWrap,
          compact && styles.iconWrapCompact,
          { borderRadius: radius.lg, backgroundColor: onDark ? 'rgba(255,255,255,0.1)' : colors.quaternaryFill },
        ]}
      >
        <Ionicons name={resolved.icon} size={compact ? 24 : 40} color={accent} />
      </View>
      <ThemedText variant={compact ? 'subheadline' : 'title3'} style={[styles.title, { color: primary }]}>
        {resolved.title()}
      </ThemedText>
      <ThemedText variant={compact ? 'footnote' : 'subheadline'} style={[styles.message, { color: secondary }]}>
        {message}
      </ThemedText>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.retry,
            { backgroundColor: accent, borderRadius: radius.pill, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="refresh" size={16} color={onDark ? '#000' : colors.onTint} />
          <ThemedText variant="subheadline" style={{ color: onDark ? '#000' : colors.onTint, fontWeight: '600' }}>
            {retryLabel ?? t('manga_refresh')}
          </ThemedText>
        </Pressable>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: Spacing.xxl, gap: Spacing.sm },
  compact: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  iconWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  iconWrapCompact: { width: 44, height: 44 },
  title: { textAlign: 'center' },
  message: { textAlign: 'center' },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
