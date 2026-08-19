import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SFSymbolIcon } from '@/components/ui/sf-symbol-icon';
import { LongPressScalePressable } from '@/components/ui/long-press-scale-pressable';
import { ThemedText } from '@/components/ui/themed-text';
import { t } from '@/constants/locales';
import { Spacing } from '@/constants/theme';
import { useSourceCoverHeaders } from '@/context/source-cover-context';
import { useTheme } from '@/hooks/use-theme';
import { coverImageSource } from '@/utils/cover-image-source';

type MangaCoverProps = {
  title: string;
  cover?: string;
  width: number;
  inLibrary?: boolean;
  unreadCount?: number;
  downloadedCount?: number;
  showBookmark?: boolean;
  showTitleOverlay?: boolean;
  updateFailed?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function MangaCover({
  title,
  cover,
  width,
  inLibrary = false,
  unreadCount = 0,
  downloadedCount = 0,
  showBookmark = true,
  showTitleOverlay = true,
  updateFailed = false,
  onPress,
  onLongPress,
}: MangaCoverProps) {
  const { colors, radius } = useTheme();
  const coverHeaders = useSourceCoverHeaders();
  const height = Math.round(width * 1.45);
  const showUnread = inLibrary && unreadCount > 0;
  const showDownloaded = inLibrary && downloadedCount > 0;
  const pressableProps = {
    style: StyleSheet.flatten([styles.pressable, { width }]),
    onPress,
    onLongPress,
    delayLongPress: 240,
    disabled: !onPress && !onLongPress,
    accessibilityRole: (onPress || onLongPress ? 'button' : 'image') as 'button' | 'image',
  };

  const coverBody = (
      <View style={[styles.cover, { width, height, borderRadius: radius.sm, backgroundColor: colors.secondaryFill }]}>
        {cover ? (
          <Image
            source={coverImageSource(cover, coverHeaders)}
            style={StyleSheet.absoluteFill}
            contentFit='cover'
            recyclingKey={cover}
            transition={0}
          />
        ) : (
          <ThemedText variant='caption2' color='tertiaryLabel' style={styles.placeholder}>
            {title.slice(0, 1)}
          </ThemedText>
        )}

        {showBookmark && inLibrary ? (
          <View style={[styles.bookmarkBadge, { backgroundColor: colors.tint }]}>
            <SFSymbolIcon name='bookmark.fill' size={11} color={colors.onTint} fallback='bookmark' />
          </View>
        ) : null}

        {showUnread || showDownloaded ? (
          <View style={styles.countRow}>
            {showUnread ? (
              <View style={[styles.countBadge, styles.unreadBadge]}>
                <Text style={styles.countText}>{formatCount(unreadCount)}</Text>
              </View>
            ) : null}
            {showDownloaded ? (
              <View style={[styles.countBadge, styles.downloadedBadge]}>
                <Text style={styles.countText}>{formatCount(downloadedCount)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {updateFailed ? (
          <View
            style={styles.updateFailedBadge}
            accessibilityRole='image'
            accessibilityLabel={t('library_update_failed')}>
            <SFSymbolIcon name='exclamationmark.triangle.fill' size={14} color='#FFFFFF' fallback='warning' />
          </View>
        ) : null}

        {showTitleOverlay ? (
          <>
            <LinearGradient
              colors={['rgba(0,0,0,0.01)', 'rgba(0,0,0,0.72)']}
              style={styles.titleGradient}
              pointerEvents='none'
            />
            <View style={[styles.titleWrap, updateFailed ? styles.titleWrapWithWarn : null]}>
              <Text style={styles.title} numberOfLines={2} ellipsizeMode='tail'>
                {title}
              </Text>
            </View>
          </>
        ) : null}
      </View>
  );

  if (onLongPress) {
    return (
      <LongPressScalePressable {...pressableProps} squeezeScale={0.92}>
        {coverBody}
      </LongPressScalePressable>
    );
  }

  return <Pressable {...pressableProps}>{coverBody}</Pressable>;
}

function formatCount(value: number): string {
  if (value > 99) return '99+';
  return String(value);
}

const styles = StyleSheet.create({
  pressable: {
    flexGrow: 0,
    flexShrink: 0,
  },
  cover: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    fontSize: 24,
    fontWeight: '700',
  },
  bookmarkBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  countRow: {
    position: 'absolute',
    top: Spacing.xs,
    left: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    zIndex: 2,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadge: {
    backgroundColor: '#FF3B30',
  },
  downloadedBadge: {
    backgroundColor: '#007AFF',
  },
  updateFailedBadge: {
    position: 'absolute',
    right: Spacing.xs,
    bottom: Spacing.xs,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    zIndex: 3,
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  titleGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '52%',
    zIndex: 2,
  },
  titleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    zIndex: 2,
  },
  titleWrapWithWarn: {
    paddingRight: Spacing.sm + 22 + Spacing.xs,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
  },
});
