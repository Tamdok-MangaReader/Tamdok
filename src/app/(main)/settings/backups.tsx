import { Ionicons } from "@expo/vector-icons";
import { Button, ContextMenu, Host, RNHostView } from "@expo/ui/swift-ui";
import * as DocumentPicker from "expo-document-picker";
import { Stack } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";

import {
  SwipeableRow,
  SwipeableRowsProvider,
  type SwipeAction,
} from "@/components/sources/swipeable-row";
import { Card, CardSeparator } from "@/components/ui/card";
import { ScreenContent } from "@/components/ui/screen-content";
import { SectionLabel } from "@/components/ui/section-label";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useSources } from "@/context/sources-context";
import { useTheme } from "@/hooks/use-theme";
import {
  createBackup,
  deleteBackup,
  importBackupFromUri,
  listBackups,
  restoreBackup,
  shareBackup,
  type RestoreProgress,
  type RestoreResult,
} from "@/services/backup";
import { BackupOptionsModal } from "@/components/backups/backup-options-modal";
import type { BackupScope } from "@/services/backup-config";

type BackupItem = {
  name: string;
  uri: string;
  date: number;
  size: number;
  auto: boolean;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatBackupDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BackupsSettingsScreen() {
  const { colors, isDark } = useTheme();
  const { refresh } = useSources();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [optionsMode, setOptionsMode] = useState<"auto" | "create" | null>(
    null,
  );
  const lastOptionsModeRef = useRef<"auto" | "create">("auto");
  if (optionsMode) lastOptionsModeRef.current = optionsMode;
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    setBackups(await listBackups());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleProgress = (progress: RestoreProgress) => {
    if (progress.phase === "sources") {
      setBusyMessage(
        t("backups_restoring_sources", {
          current: String(progress.current),
          total: String(progress.total),
          name: progress.sourceName ?? "",
        }),
      );
      return;
    }
    setBusyMessage(t("backups_restoring"));
  };

  const finishRestore = async (result: RestoreResult) => {
    await refresh();
    await load();
    if (result.sourcesFailed.length > 0) {
      Alert.alert(
        t("backups_restore_action"),
        t("backups_restore_sources_failed", {
          count: String(result.sourcesFailed.length),
        }),
      );
    }
  };

  const runRestore = async (
    task: (
      onProgress: (progress: RestoreProgress) => void,
    ) => Promise<RestoreResult>,
  ) => {
    setBusy(true);
    setBusyMessage(t("backups_restoring"));
    try {
      const result = await task(handleProgress);
      await finishRestore(result);
    } finally {
      setBusy(false);
      setBusyMessage(null);
    }
  };

  const createRef = useRef<() => void>(() => {});
  const importRef = useRef<() => Promise<void>>(async () => {});

  const handleCreate = async (scope: BackupScope) => {
    setBusy(true);
    setBusyMessage(t("backups_creating"));
    try {
      await createBackup({ scope });
      await load();
    } catch (error) {
      Alert.alert(
        t("backups_create"),
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
      setBusyMessage(null);
    }
  };

  const confirmRestore = (uri: string) => {
    Alert.alert(t("backups_restore_title"), t("backups_restore_confirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("backups_restore_action"),
        style: "destructive",
        onPress: () => {
          void runRestore((onProgress) => restoreBackup(uri, onProgress));
        },
      },
    ]);
  };

  const confirmDelete = (uri: string, name: string) => {
    Alert.alert(t("backups_delete_title"), name, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("backups_delete_action"),
        style: "destructive",
        onPress: () => void deleteBackup(uri).then(load),
      },
    ]);
  };

  const handleImport = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    Alert.alert(t("backups_restore_title"), t("backups_restore_confirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("backups_restore_action"),
        style: "destructive",
        onPress: () => {
          const uri = result.assets[0]!.uri;
          void runRestore((onProgress) => importBackupFromUri(uri, onProgress));
        },
      },
    ]);
  };

  createRef.current = () => setOptionsMode("create");
  importRef.current = handleImport;

  const renderBackupRow = (backup: BackupItem, row: ReactElement) =>
    Platform.OS === "ios" ? (
      <Host
        matchContents={{ vertical: true }}
        colorScheme={isDark ? "dark" : "light"}
      >
        <ContextMenu>
          <ContextMenu.Trigger>
            <RNHostView matchContents={{ vertical: true }}>{row}</RNHostView>
          </ContextMenu.Trigger>
          <ContextMenu.Items>
            <Button
              label={t("backups_share")}
              systemImage="square.and.arrow.up"
              onPress={() => void shareBackup(backup.uri)}
            />
            <Button
              label={t("backups_restore_action")}
              systemImage="arrow.clockwise"
              onPress={() => confirmRestore(backup.uri)}
            />
            <Button
              label={t("backups_delete_action")}
              systemImage="trash"
              role="destructive"
              onPress={() => confirmDelete(backup.uri, backup.name)}
            />
          </ContextMenu.Items>
        </ContextMenu>
      </Host>
    ) : (
      row
    );

  const restoreAction = (backup: BackupItem): SwipeAction => ({
    key: "restore",
    label: t("backups_restore_action"),
    icon: "refresh-outline",
    sfSymbol: "arrow.clockwise",
    color: colors.tint,
    onPress: () => confirmRestore(backup.uri),
  });

  const deleteAction = (backup: BackupItem): SwipeAction => ({
    key: "delete",
    label: t("backups_delete_action"),
    icon: "trash-outline",
    sfSymbol: "trash",
    color: colors.destructive,
    onPress: () => confirmDelete(backup.uri, backup.name),
  });

  return (
    <>
      <Stack.Screen options={{ title: t("backups_settings_title") }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="clock.arrow.circlepath"
          accessibilityLabel={t("backups_auto_title")}
          separateBackground
          tintColor={colors.label}
          onPress={() => setOptionsMode("auto")}
        />
        <Stack.Toolbar.Menu
          icon="ellipsis"
          title={t("backups_settings_title")}
          disabled={busy}
          tintColor={colors.label}
        >
          <Stack.Toolbar.MenuAction
            icon="plus.circle"
            onPress={() => createRef.current()}
          >
            {t("backups_create")}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="square.and.arrow.down"
            onPress={() => void importRef.current()}
          >
            {t("backups_import")}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <ScreenContent>
        {backups.length === 0 ? (
          <ThemedText
            variant="body"
            color="secondaryLabel"
            style={styles.empty}
          >
            {t("backups_empty")}
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
                    fullSwipeLeadingActionKey="restore"
                    fullSwipeActionKey="delete"
                    onFullSwipeLeading={() => confirmRestore(backup.uri)}
                    onFullSwipe={() => confirmDelete(backup.uri, backup.name)}
                  >
                    {renderBackupRow(backup, (
                      <View
                        style={[
                          styles.backupRow,
                          { backgroundColor: colors.secondarySystemBackground },
                        ]}
                      >
                        <Ionicons
                          name="document-outline"
                          size={22}
                          color="#888"
                        />
                        <View style={styles.backupText}>
                          <View style={styles.nameRow}>
                            <ThemedText variant="body" style={styles.nameText}>
                              {backup.name}
                            </ThemedText>
                            {backup.auto ? (
                              <View
                                style={[
                                  styles.autoBadge,
                                  { backgroundColor: colors.tint },
                                ]}
                              >
                                <ThemedText variant="caption2" color="onTint">
                                  {t("backups_auto_badge")}
                                </ThemedText>
                              </View>
                            ) : null}
                          </View>
                          <ThemedText variant="footnote" color="tertiaryLabel">
                            {formatBackupDate(backup.date)}
                          </ThemedText>
                        </View>
                        <ThemedText variant="footnote" color="secondaryLabel">
                          {formatSize(backup.size)}
                        </ThemedText>
                      </View>
                    ))}
                  </SwipeableRow>
                  {index < backups.length - 1 ? <CardSeparator /> : null}
                </View>
              ))}
            </Card>
            <ThemedText
              variant="footnote"
              color="tertiaryLabel"
              style={styles.footer}
            >
              {t("backups_gestures_hint")}
            </ThemedText>
          </SwipeableRowsProvider>
        )}
        {busy && busyMessage ? (
          <ThemedText
            variant="footnote"
            color="secondaryLabel"
            style={styles.hint}
          >
            {busyMessage}
          </ThemedText>
        ) : null}
      </ScreenContent>

      <BackupOptionsModal
        visible={optionsMode !== null}
        mode={lastOptionsModeRef.current}
        onClose={() => setOptionsMode(null)}
        onCreate={(scope) => void handleCreate(scope)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  empty: {
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
  },
  backupPressable: {
    width: "100%",
  },
  backupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backupText: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  nameText: {
    flexShrink: 1,
  },
  autoBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  footer: {
    paddingHorizontal: Spacing.sm,
    marginTop: -Spacing.xs,
  },
  hint: {
    textAlign: "center",
  },
});
