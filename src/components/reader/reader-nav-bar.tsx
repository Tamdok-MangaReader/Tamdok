import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReader } from '@/components/reader/reader-context';
import { GlassIconButton } from '@/components/ui/glass-icon-button';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';

type ReaderNavBarProps = {
  visible: boolean;
};

const BUTTON_SIZE = 52;
const ICON_SIZE = 26;

export function ReaderNavBar({ visible }: ReaderNavBarProps) {
  const insets = useSafeAreaInsets();
  const { chrome, actions, foregroundColor } = useReader();

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(180)}
      style={[styles.root, { paddingTop: Math.max(insets.top, Spacing.sm) }]}
      pointerEvents='box-none'>
      <LinearGradient colors={['#000000', 'rgba(0,0,0,0.72)', 'transparent']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents='none' />
      <View style={styles.row}>
        <GlassIconButton
          icon='close'
          onPress={actions.closeReader}
          iconColor={foregroundColor}
          size={BUTTON_SIZE}
          iconSize={ICON_SIZE}
          accessibilityLabel='Close'
        />
        <View style={styles.center}>
          <ThemedText variant='subheadline' numberOfLines={1} style={{ color: foregroundColor, textAlign: 'center', fontWeight: '600' }}>
            {chrome.chapterTitle || chrome.mangaTitle}
          </ThemedText>
        </View>
        <View style={styles.actions}>
          <GlassIconButton
            icon='list'
            onPress={actions.openChapterList}
            iconColor={foregroundColor}
            size={BUTTON_SIZE}
            iconSize={ICON_SIZE}
            accessibilityLabel='Chapters'
          />
          <GlassIconButton
            icon='globe-outline'
            onPress={actions.openChapterUrl}
            iconColor={foregroundColor}
            size={BUTTON_SIZE}
            iconSize={ICON_SIZE}
            accessibilityLabel='Open in browser'
          />
          <GlassIconButton
            icon='settings-outline'
            onPress={actions.openReaderSettings}
            iconColor={foregroundColor}
            size={BUTTON_SIZE}
            iconSize={ICON_SIZE}
            accessibilityLabel='Reader settings'
          />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  center: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
