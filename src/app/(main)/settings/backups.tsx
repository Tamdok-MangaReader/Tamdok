import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View, type View as ViewType } from 'react-native';

import { SwipeableRow, SwipeableRowsProvider, type SwipeAction } from '@/components/sources/swipeable-row';
import { Card, CardSeparator } from '@/components/ui/card';
import {
  InlineActionMenu,
  type InlineActionMenuAnchor,
  type InlineActionMenuItem,
} from '@/components/ui/inline-action-menu';
import { LongPressScalePressable } from '@/components/ui/long-press-scale-pressable';
import { ListRow } from '@/components/ui/list-row';
import { ScreenContent } from '@/components/ui/screen-content';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useSources } from '@/context/sources-context';
import { useTheme } from '@/hooks/use-theme';
import {
  createBackup,
  deleteBackup,
  importBackupFromUri,
  listBackups,
  restoreBackup,
  shareBackup,
  type RestoreProgress,
  type RestoreResult,
} from '@/services/backup';

type BackupItem = { name: string; uri: string; date: number };

export default function BackupsSettingsScreen() {
  const { colors } = useTheme();
  const { refresh } = useSources();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<InlineActionMenuAnchor | null>(null);
  const [menuBackup, setMenuBackup] = useState<BackupItem | null>(null);
  const rowRefs = useRef<Record<string, ViewType | null>>({});

  const load = useCallback(async () => {
    setBackups(await listBackups());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleProgress = (progress: RestoreProgress) => {
    if (progress.phase === 'sources') {
      setBusyMessage(
        t('backups_restoring_sources', {
          current: String(progress.current),
          total: String(progress.total),
          name: progress.sourceName ?? '',
        }),
      );
      return;
    }
    setBusyMessage(t('backups_restoring'));
  };

  const finishRestore = async (result: RestoreResult) => {
    await refresh();
    await load();
    if (result.sourcesFailed.length > 0) {
      Alert.alert(t('backups_restore_action'), t('backups_restore_sources_failed', { count: String(result.sourcesFailed.length) }));
    }
  };

  const runRestore = async (task: (onProgress: (progress: RestoreProgress) => void) => Promise<RestoreResult>) => {
    setBusy(true);
    setBusyMessage(t('backups_restoring'));
    try {
      const result = await task(handleProgress);
      await finishRestore(result);
    } finally {
      setBusy(false);
      setBusyMessage(null);
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setBusyMessage(t('backups_creating'));
    try {
      await createBackup();
      await load();
    } finally {
      setBusy(false);
      setBusyMessage(null);
    }
  };

  const confirmRestore = (uri: string) => {
    Alert.alert(t('backups_restore_title'), t('backups_restore_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('backups_restore_action'),
        style: 'destructive',
        onPress: () => {
          void runRestore((onProgress) => restoreBackup(uri, onProgress));
        },
      },
    ]);
  };

  const confirmDelete = (uri: string, name: string) => {
    Alert.alert(t('backups_delete_title'), name, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('backups_delete_action'),
        style: 'destructive',
        onPress: () => void deleteBackup(uri).then(load),
      },
    ]);
  };

  const handleImport = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]?.uri) return;
    Alert.alert(t('backups_restore_title'), t('backups_restore_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('backups_restore_action'),
        style: 'destructive',
        onPress: () => {
          const uri = result.assets[0]!.uri;
          void runRestore((onProgress) => importBackupFromUri(uri, onProgress));
        },
      },
    ]);
  };

  const openBackupMenu = (backup: BackupItem) => {
    const ref = rowRefs.current[backup.uri];
    ref?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setMenuBackup(backup);
      setMenuVisible(true);
    });
  };

  const closeMenu = () => {
    setMenuVisible(false);
    setMenuAnchor(null);
    setMenuBackup(null);
  };

  const menuItems: InlineActionMenuItem[] = menuBackup
    ? [
        {
          key: 'share',
          label: t('backups_share'),
          sfSymbol: 'square.and.arrow.up',
          fallbackIcon: 'share-outline',
          onPress: () => void shareBackup(menuBackup.uri),
        },
        {
          key: 'restore',
          label: t('backups_restore_action'),
          sfSymbol: 'arrow.clockwise',
          fallbackIcon: 'refresh-outline',
          onPress: () => confirmRestore(menuBackup.uri),
        },
        {
          key: 'delete',
          label: t('backups_delete_action'),
          sfSymbol: 'trash',
          fallbackIcon: 'trash-outline',
          destructive: true,
          onPress: () => confirmDelete(menuBackup.uri, menuBackup.name),
        },
      ]
    : [];

  const restoreAction = (backup: BackupItem): SwipeAction => ({
    key: 'restore',
    label: t('backups_restore_action'),
    icon: 'refresh-outline',
    sfSymbol: 'arrow.clockwise',
    color: colors.tint,
    onPress: () => confirmRestore(backup.uri),
  });

  const deleteAction = (backup: BackupItem): SwipeAction => ({
    key: 'delete',
    label: t('backups_delete_action'),
    icon: 'trash-outline',
    sfSymbol: 'trash',
    color: colors.destructive,
    onPress: () => confirmDelete(backup.uri, backup.name),
  });

  return (
    <>
      <Stack.Screen options={{ title: t('backups_settings_title') }} />
      <ScreenContent>
        <SectionLabel isFirst>{t('backups_actions')}</SectionLabel>
        <Card>
          <ListRow
            icon='add-circle-outline'
            label={t('backups_create')}
            onPress={busy ? undefined : () => void handleCreate()}
            isFirst
          />
          <CardSeparator />
          <ListRow
            icon='download-outline'
            label={t('backups_import')}
            onPress={busy ? undefined : () => void handleImport()}
            isLast
          />
        </Card>

        <SectionLabel>{t('backups_saved')}</SectionLabel>
        {backups.length === 0 ? (
          <ThemedText variant='body' color='secondaryLabel' style={styles.empty}>
            {t('backups_empty')}
          </ThemedText>
        ) : (
          <SwipeableRowsProvider>
            <Card>
              {backups.map((backup, index) => (
                <View key={backup.uri}>
                  <SwipeableRow
                    rowId={backup.uri}
                    leadingActions={[restoreAction(backup)]}
                    actions={[deleteAction(backup)]}
                    fullSwipeLeadingActionKey='restore'
                    fullSwipeActionKey='delete'
                    onFullSwipeLeading={() => confirmRestore(backup.uri)}
                    onFullSwipe={() => confirmDelete(backup.uri, backup.name)}>
                    <LongPressScalePressable
                      ref={(ref) => {
                        rowRefs.current[backup.uri] = ref;
                      }}
                      style={styles.backupPressable}
                      onPress={() => void shareBackup(backup.uri)}
                      onLongPress={() => openBackupMenu(backup)}>
                      <View style={styles.backupRow}>
                        <Ionicons name='document-outline' size={22} color='#888' />
                        <View style={styles.backupText}>
                          <ThemedText variant='body'>{backup.name}</ThemedText>
                          <ThemedText variant='footnote' color='tertiaryLabel'>
                            {new Date(backup.date).toLocaleString()}
                          </ThemedText>
                        </View>
                      </View>
                    </LongPressScalePressable>
                  </SwipeableRow>
                  {index < backups.length - 1 ? <CardSeparator /> : null}
                </View>
              ))}
            </Card>
          </SwipeableRowsProvider>
        )}
        {busy && busyMessage ? (
          <ThemedText variant='footnote' color='secondaryLabel' style={styles.hint}>
            {busyMessage}
          </ThemedText>
        ) : null}
      </ScreenContent>

      <InlineActionMenu
        visible={menuVisible}
        anchor={menuAnchor}
        title={menuBackup?.name}
        items={menuItems}
        onClose={closeMenu}
      />
    </>
  );
}

const styles = StyleSheet.create({
  empty: {
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  backupPressable: {
    width: '100%',
  },
  backupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backupText: {
    flex: 1,
    gap: 2,
  },
  hint: {
    textAlign: 'center',
  },
});
