import { Modal, Pressable, Share, StyleSheet, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';

import { useReader } from '@/components/reader/reader-context';
import { GlassSurface } from '@/components/ui/glass-surface';
import { SFSymbolIcon } from '@/components/ui/sf-symbol-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';
import type { ReaderPage } from '@/utils/reader-pages';

export type ReaderQuickActionAnchor = {
  x: number;
  y: number;
};

type ReaderQuickActionsProps = {
  visible: boolean;
  page: ReaderPage | null;
  anchor: ReaderQuickActionAnchor | null;
  spreadPageIndex?: number;
  usesDoublePages?: boolean;
  isPageIsolated?: boolean;
  canSetSinglePage?: boolean;
  onClose: () => void;
  onReload: () => void;
  onToggleSinglePage?: (isolated: boolean) => void;
};

export function ReaderQuickActions({
  visible,
  page,
  anchor,
  spreadPageIndex,
  usesDoublePages = false,
  isPageIsolated = false,
  canSetSinglePage = false,
  onClose,
  onReload,
  onToggleSinglePage,
}: ReaderQuickActionsProps) {
  const { colors, radius } = useTheme();

  if (!visible || !page?.url) return null;

  const panelTop = Math.max(Spacing.lg, (anchor?.y ?? 120) - 20);

  const sharePage = async () => {
    onClose();
    await Share.share({ url: page.url!, message: page.url });
  };

  const saveToPhotos = async () => {
    onClose();
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) return;
    const filename = `${FileSystem.cacheDirectory}reader-page-${Date.now()}.jpg`;
    const downloaded = await FileSystem.downloadAsync(page.url!, filename);
    await MediaLibrary.saveToLibraryAsync(downloaded.uri);
  };

  const items = [
    {
      key: 'share',
      label: t('reader_quick_share'),
      sfSymbol: 'square.and.arrow.up',
      onPress: sharePage,
    },
    {
      key: 'save',
      label: t('reader_quick_save_photos'),
      sfSymbol: 'square.and.arrow.down',
      onPress: saveToPhotos,
    },
    {
      key: 'reload',
      label: t('reader_quick_reload'),
      sfSymbol: 'arrow.clockwise',
      onPress: () => {
        onClose();
        onReload();
      },
    },
  ];

  if (usesDoublePages && canSetSinglePage && spreadPageIndex != null && onToggleSinglePage) {
    items.splice(2, 0, {
      key: 'single',
      label: isPageIsolated ? t('reader_quick_unset_single_page') : t('reader_quick_set_single_page'),
      sfSymbol: isPageIsolated ? 'rectangle.portrait.slash' : 'rectangle.portrait',
      onPress: () => {
        onClose();
        onToggleSinglePage(!isPageIsolated);
      },
    });
  }

  return (
    <Modal visible transparent animationType='fade' onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.panelWrap, { top: panelTop }]}
          onPress={(event) => event.stopPropagation()}>
          <GlassSurface borderRadius={radius.md} style={styles.panel}>
            {items.map((item, index) => (
              <Pressable
                key={item.key}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                  pressed && { backgroundColor: colors.quaternaryFill },
                ]}
                onPress={() => void item.onPress()}>
                <SFSymbolIcon
                  name={item.sfSymbol}
                  size={18}
                  color={colors.label}
                  fallback={item.key === 'share' ? 'share-outline' : item.key === 'save' ? 'download-outline' : item.key === 'reload' ? 'refresh-outline' : 'document-outline'}
                />
                <ThemedText variant='body'>{item.label}</ThemedText>
              </Pressable>
            ))}
          </GlassSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  panelWrap: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
  },
  panel: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
