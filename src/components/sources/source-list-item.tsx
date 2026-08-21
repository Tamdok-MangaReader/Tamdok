import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View, type ImageSourcePropType, type ViewProps } from 'react-native';

import { SFSymbolIcon } from '@/components/ui/sf-symbol-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import type { InstalledSource, RegistryEntry } from '@/parsers/shared/types';
import { useTheme } from '@/hooks/use-theme';
import { IMAGE_CACHE_POLICY } from '@/utils/image-memory';

type SourceListItemProps = {
  title: string;
  subtitle?: string;
  iconUri?: string;
  iconSource?: ImageSourcePropType;
  badge?: string;
  showChevron?: boolean;
  updateAvailable?: number;
  trailing?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  imageTransition?: number;
};

export const SourceListItem = memo(function SourceListItem({
  title,
  subtitle,
  iconUri,
  iconSource,
  badge,
  showChevron,
  updateAvailable,
  trailing,
  onPress,
  onLongPress,
  imageTransition = 150,
}: SourceListItemProps) {
  const { colors, radius } = useTheme();
  const rowPressable = (onPress != null || onLongPress != null) && trailing == null;
  const Container = rowPressable ? Pressable : View;

  const containerProps: ViewProps & { onPress?: () => void; onLongPress?: () => void } = {
    accessibilityRole: rowPressable ? 'button' : undefined,
  };

  if (rowPressable) {
    const pressable = containerProps as React.ComponentProps<typeof Pressable>;
    pressable.onPress = onPress;
    pressable.onLongPress = onLongPress;
    pressable.style = ({ pressed }: { pressed: boolean }) => [
      styles.row,
      pressed && onPress != null && { backgroundColor: colors.quaternaryFill },
    ];
  } else {
    containerProps.style = styles.row;
  }

  const imageSource = iconSource ?? (iconUri ? { uri: normalizeIconUri(iconUri) } : undefined);

  return (
    <Container {...containerProps}>
      <View style={[styles.iconWrap, { borderRadius: radius.sm, backgroundColor: colors.quaternaryFill }]}>
        {imageSource ? (
          <Image
            source={imageSource}
            style={[styles.icon, { borderRadius: radius.sm }]}
            contentFit='cover'
            cachePolicy={IMAGE_CACHE_POLICY}
            recyclingKey={iconUri}
            transition={imageTransition}
          />
        ) : (
          <ThemedText variant='caption1'>{title.slice(0, 1)}</ThemedText>
        )}
      </View>
      <View style={styles.meta}>
        <ThemedText variant='body' style={styles.title}>
          {title}
        </ThemedText>
        {subtitle && (
          <ThemedText variant='caption1' color='secondaryLabel'>
            {subtitle}
          </ThemedText>
        )}
      </View>
      {updateAvailable != null && (
        <View style={[styles.updateBadge, { backgroundColor: '#FF3B30', borderRadius: radius.pill }]}>
          <SFSymbolIcon name='arrow.up.circle.fill' size={12} color='#FFFFFF' fallback='arrow-up-circle' />
          <ThemedText variant='caption2' style={styles.updateBadgeText}>
            v{updateAvailable}
          </ThemedText>
        </View>
      )}
      {badge && (
        <View style={[styles.badge, { backgroundColor: colors.secondaryFill, borderRadius: radius.sm }]}>
          <ThemedText variant='caption2' color='secondaryLabel'>
            {badge}
          </ThemedText>
        </View>
      )}
      {showChevron && !trailing && <Ionicons name='chevron-forward' size={18} color={colors.tertiaryLabel} />}
      {trailing}
    </Container>
  );
});

const MAX_VISIBLE_LANGUAGES = 3;

function formatLanguagesLabel(languages: string[]): string {
  if (languages.length <= MAX_VISIBLE_LANGUAGES) {
    return languages.join(', ');
  }

  const visible = languages.slice(0, MAX_VISIBLE_LANGUAGES);
  const remaining = languages.length - MAX_VISIBLE_LANGUAGES;
  return `${visible.join(', ')} +${remaining}`;
}

export function installedSourceSubtitle(source: InstalledSource, updateVersion?: number): string {
  const base = `${source.kind.toUpperCase()} · v${source.manifest.info.version} · ${formatLanguagesLabel(source.manifest.info.languages)}`;
  if (updateVersion && updateVersion > source.manifest.info.version) {
    return `${base} · ${t('source_update_available')}`;
  }
  return base;
}

export function registryEntrySubtitle(entry: RegistryEntry): string {
  return `v${entry.version} · ${formatLanguagesLabel(entry.languages)}`;
}

function normalizeIconUri(uri: string): string {
  if (/^https?:\/\//i.test(uri)) {
    return uri;
  }
  if (uri.startsWith('file://')) {
    return uri;
  }
  if (uri.startsWith('/')) {
    return `file://${uri}`;
  }
  return uri;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  icon: {
    width: 44,
    height: 44,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontWeight: '600',
  },
  updateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  updateBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
});
