import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

import { HeaderIconButton } from '@/components/ui/header-icon-button';
import { GlassSurface } from '@/components/ui/glass-surface';
import { SFSymbolIcon } from '@/components/ui/sf-symbol-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';

type MenuItem = {
  key: string;
  label: string;
  sfSymbol: string;
  fallbackIcon: 'share-outline' | 'folder-outline' | 'list-outline' | 'refresh-outline' | 'download-outline' | 'trash-outline' | 'checkmark-circle-outline' | 'ellipse-outline' | 'checkbox-outline' | 'square-outline' | 'checkmark-done-outline';
  destructive?: boolean;
  onPress: () => void;
};

type MangaOverflowMenuProps = {
  chapterSelectMode: boolean;
  hasDownloads: boolean;
  canShare: boolean;
  canDownload: boolean;
  onShare: () => void;
  onSelectChapters: () => void;
  onMarkAllRead: () => void;
  onMarkAllUnread: () => void;
  onMarkSelectedRead: () => void;
  onMarkSelectedUnread: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRefresh: () => void;
  onDownloadAll: () => void;
  onDownloadSelected: () => void;
  onRemoveDownloads: () => void;
};

function MenuRow({
  item,
  showDivider,
  trailingSymbol,
  onPress,
}: {
  item: MenuItem;
  showDivider: boolean;
  trailingSymbol?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuRow,
        showDivider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
        pressed && { backgroundColor: colors.quaternaryFill },
      ]}
      onPress={onPress}
      accessibilityRole='button'>
      <SFSymbolIcon
        name={item.sfSymbol}
        fallback={item.fallbackIcon}
        size={18}
        color={item.destructive ? colors.destructive : colors.label}
      />
      <ThemedText variant='body' color={item.destructive ? 'destructive' : 'label'} style={styles.menuLabel}>
        {item.label}
      </ThemedText>
      {trailingSymbol ? (
        <SFSymbolIcon name={trailingSymbol} fallback='chevron-down' size={16} color={colors.tertiaryLabel} />
      ) : null}
    </Pressable>
  );
}

export function MangaOverflowMenu({
  chapterSelectMode,
  hasDownloads,
  canShare,
  canDownload,
  onShare,
  onSelectChapters,
  onMarkAllRead,
  onMarkAllUnread,
  onMarkSelectedRead,
  onMarkSelectedUnread,
  onSelectAll,
  onDeselectAll,
  onRefresh,
  onDownloadAll,
  onDownloadSelected,
  onRemoveDownloads,
}: MangaOverflowMenuProps) {
  const { radius } = useTheme();
  const [open, setOpen] = useState(false);
  const [markAllExpanded, setMarkAllExpanded] = useState(false);
  const [markSelectedExpanded, setMarkSelectedExpanded] = useState(false);
  const [selectExpanded, setSelectExpanded] = useState(false);

  const close = () => {
    setOpen(false);
    setMarkAllExpanded(false);
    setMarkSelectedExpanded(false);
    setSelectExpanded(false);
  };

  const run = (action: () => void) => {
    void Haptics.selectionAsync();
    close();
    action();
  };

  const normalModeItems: MenuItem[] = [
    {
      key: 'select',
      label: t('manga_select_chapters'),
      sfSymbol: 'checklist',
      fallbackIcon: 'list-outline',
      onPress: onSelectChapters,
    },
    {
      key: 'refresh',
      label: t('manga_refresh'),
      sfSymbol: 'arrow.clockwise',
      fallbackIcon: 'refresh-outline',
      onPress: onRefresh,
    },
    ...(canDownload
      ? [{
          key: 'download',
          label: t('manga_download_all'),
          sfSymbol: 'arrow.down.circle',
          fallbackIcon: 'download-outline' as const,
          onPress: onDownloadAll,
        }]
      : []),
    ...(hasDownloads
      ? [{
          key: 'remove-downloads',
          label: t('manga_remove_downloads'),
          sfSymbol: 'trash',
          fallbackIcon: 'trash-outline' as const,
          destructive: true,
          onPress: onRemoveDownloads,
        }]
      : []),
  ];

  const shareItem: MenuItem | null = canShare
    ? {
        key: 'share',
        label: t('manga_share'),
        sfSymbol: 'square.and.arrow.up',
        fallbackIcon: 'share-outline',
        onPress: onShare,
      }
    : null;

  const menu = !open ? null : (
    <Pressable style={styles.backdrop} onPress={close}>
      <View style={styles.menuAnchor}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <GlassSurface borderRadius={radius.md} style={styles.menuCard}>
            {!chapterSelectMode ? (
              <>
                {shareItem ? (
                  <MenuRow item={shareItem} showDivider={false} onPress={() => run(shareItem.onPress)} />
                ) : null}
                <MenuRow
                  item={{
                    key: 'mark-all',
                    label: t('manga_mark_all'),
                    sfSymbol: 'checkmark.rectangle.stack',
                    fallbackIcon: 'checkmark-done-outline',
                    onPress: () => setMarkAllExpanded((value) => !value),
                  }}
                  showDivider={Boolean(shareItem)}
                  trailingSymbol={markAllExpanded ? 'chevron.up' : 'chevron.down'}
                  onPress={() => setMarkAllExpanded((value) => !value)}
                />
                {markAllExpanded ? (
                  <>
                    <MenuRow
                      item={{
                        key: 'mark-all-read',
                        label: t('manga_read'),
                        sfSymbol: 'checkmark.circle',
                        fallbackIcon: 'checkmark-circle-outline',
                        onPress: onMarkAllRead,
                      }}
                      showDivider
                      onPress={() => run(onMarkAllRead)}
                    />
                    <MenuRow
                      item={{
                        key: 'mark-all-unread',
                        label: t('manga_unread'),
                        sfSymbol: 'circle',
                        fallbackIcon: 'ellipse-outline',
                        onPress: onMarkAllUnread,
                      }}
                      showDivider
                      onPress={() => run(onMarkAllUnread)}
                    />
                  </>
                ) : null}
                {normalModeItems.map((item) => (
                  <MenuRow key={item.key} item={item} showDivider onPress={() => run(item.onPress)} />
                ))}
              </>
            ) : (
              <>
                <MenuRow
                  item={{
                    key: 'mark-selected',
                    label: t('manga_mark_selected'),
                    sfSymbol: 'checkmark.rectangle.stack',
                    fallbackIcon: 'checkmark-done-outline',
                    onPress: () => setMarkSelectedExpanded((value) => !value),
                  }}
                  showDivider={false}
                  trailingSymbol={markSelectedExpanded ? 'chevron.up' : 'chevron.down'}
                  onPress={() => setMarkSelectedExpanded((value) => !value)}
                />
                {markSelectedExpanded ? (
                  <>
                    <MenuRow
                      item={{
                        key: 'read',
                        label: t('manga_read'),
                        sfSymbol: 'checkmark.circle',
                        fallbackIcon: 'checkmark-circle-outline',
                        onPress: onMarkSelectedRead,
                      }}
                      showDivider
                      onPress={() => run(onMarkSelectedRead)}
                    />
                    <MenuRow
                      item={{
                        key: 'unread',
                        label: t('manga_unread'),
                        sfSymbol: 'circle',
                        fallbackIcon: 'ellipse-outline',
                        onPress: onMarkSelectedUnread,
                      }}
                      showDivider
                      onPress={() => run(onMarkSelectedUnread)}
                    />
                  </>
                ) : null}
                <MenuRow
                  item={{
                    key: 'select-group',
                    label: t('manga_selection'),
                    sfSymbol: 'checklist',
                    fallbackIcon: 'list-outline',
                    onPress: () => setSelectExpanded((value) => !value),
                  }}
                  showDivider
                  trailingSymbol={selectExpanded ? 'chevron.up' : 'chevron.down'}
                  onPress={() => setSelectExpanded((value) => !value)}
                />
                {selectExpanded ? (
                  <>
                    <MenuRow
                      item={{
                        key: 'select-all',
                        label: t('manga_select_all'),
                        sfSymbol: 'checkmark.circle.fill',
                        fallbackIcon: 'checkbox-outline',
                        onPress: onSelectAll,
                      }}
                      showDivider
                      onPress={() => run(onSelectAll)}
                    />
                    <MenuRow
                      item={{
                        key: 'deselect-all',
                        label: t('manga_deselect_all'),
                        sfSymbol: 'circle',
                        fallbackIcon: 'square-outline',
                        onPress: onDeselectAll,
                      }}
                      showDivider
                      onPress={() => run(onDeselectAll)}
                    />
                  </>
                ) : null}
                {canDownload ? (
                  <MenuRow
                    item={{
                      key: 'download-selected',
                      label: t('manga_download_selected'),
                      sfSymbol: 'arrow.down.circle',
                      fallbackIcon: 'download-outline',
                      onPress: onDownloadSelected,
                    }}
                    showDivider
                    onPress={() => run(onDownloadSelected)}
                  />
                ) : null}
              </>
            )}
          </GlassSurface>
        </Pressable>
      </View>
    </Pressable>
  );

  return (
    <>
      <HeaderIconButton
        icon='ellipsis-horizontal'
        accessibilityLabel={t('manga')}
        onPress={() => {
          void Haptics.selectionAsync();
          setOpen((value) => !value);
          setMarkAllExpanded(false);
          setMarkSelectedExpanded(false);
          setSelectExpanded(false);
        }}
      />
      {open ? (
        Platform.OS === 'ios' ? (
          <FullWindowOverlay>
            <View style={styles.overlayRoot} collapsable={false}>
              {menu}
            </View>
          </FullWindowOverlay>
        ) : (
          <Modal visible transparent animationType='fade' onRequestClose={close}>
            {menu}
          </Modal>
        )
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFill,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  menuAnchor: {
    position: 'absolute',
    top: 96,
    right: Spacing.lg,
    minWidth: 240,
    maxWidth: 320,
  },
  menuCard: {
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  menuLabel: {
    flex: 1,
  },
});
