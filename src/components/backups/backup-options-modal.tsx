import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";

import { Card, CardSeparator } from "@/components/ui/card";
import { MODAL_HEADER_HEIGHT, ModalHeader } from "@/components/ui/modal-header";
import { SectionLabel } from "@/components/ui/section-label";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { runAutoBackupIfNeeded, syncAutoBackupTask } from "@/services/auto-backup";
import {
  BACKUP_INTERVALS,
  BACKUP_KEEP_OPTIONS,
  BACKUP_SECTIONS,
  defaultBackupSettings,
  getBackupSettings,
  hasAnyScope,
  updateBackupSettings,
  type BackupInterval,
  type BackupScope,
  type BackupScopeKey,
} from "@/services/backup-config";

type Props = {
  visible: boolean;
  mode: "auto" | "create";
  onClose: () => void;
  onCreate?: (scope: BackupScope) => void;
};

export function BackupOptionsModal({ visible, mode, onClose, onCreate }: Props) {
  const { colors, radius } = useTheme();
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [interval, setIntervalValue] = useState<BackupInterval>("1d");
  const [keepCount, setKeepCount] = useState(5);
  const [scope, setScope] = useState<BackupScope>(
    defaultBackupSettings().autoScope,
  );

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void getBackupSettings().then((settings) => {
      if (cancelled) return;
      setAutoEnabled(settings.autoEnabled);
      setIntervalValue(settings.interval);
      setKeepCount(settings.keepCount);
      setScope(mode === "auto" ? settings.autoScope : settings.manualScope);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, mode]);

  const toggleKey = useCallback((key: BackupScopeKey, value: boolean) => {
    setScope((current) => ({ ...current, [key]: value }));
  }, []);

  const handleConfirm = useCallback(async () => {
    if (mode === "auto") {
      await updateBackupSettings({
        autoEnabled,
        interval,
        keepCount,
        autoScope: scope,
      });
      await syncAutoBackupTask();
      onClose();
      if (autoEnabled) void runAutoBackupIfNeeded();
      return;
    }
    await updateBackupSettings({ manualScope: scope });
    onClose();
    onCreate?.(scope);
  }, [mode, autoEnabled, interval, keepCount, scope, onClose, onCreate]);

  const confirmDisabled = !hasAnyScope(scope) && (mode === "create" || autoEnabled);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.groupedBackground }]}>
        <ModalHeader
          title={
            mode === "auto" ? t("backups_auto_title") : t("backups_options_title")
          }
          closeLabel={t("cancel")}
          onClose={onClose}
          actionLabel={
            mode === "auto" ? t("done") : t("backups_options_create")
          }
          actionDisabled={confirmDisabled}
          onAction={() => void handleConfirm()}
        />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: MODAL_HEADER_HEIGHT + Spacing.md },
          ]}
          scrollIndicatorInsets={{ top: MODAL_HEADER_HEIGHT }}
          showsVerticalScrollIndicator={false}
        >
          {mode === "auto" ? (
            <View style={styles.section}>
              <SectionLabel isFirst>{t("backups_auto_section")}</SectionLabel>
              <Card>
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <ThemedText variant="body">
                      {t("backups_auto_enabled")}
                    </ThemedText>
                    <ThemedText variant="footnote" color="secondaryLabel">
                      {t("backups_auto_enabled_hint")}
                    </ThemedText>
                  </View>
                  <Switch value={autoEnabled} onValueChange={setAutoEnabled} />
                </View>
                {autoEnabled ? (
                  <>
                    <CardSeparator />
                    <View style={styles.block}>
                      <ThemedText variant="body">
                        {t("backups_auto_interval")}
                      </ThemedText>
                      <View style={styles.pills}>
                        {BACKUP_INTERVALS.map((option) => (
                          <Pill
                            key={option}
                            label={t(`backups_interval_${option}`)}
                            selected={interval === option}
                            onPress={() => setIntervalValue(option)}
                            radius={radius.pill}
                          />
                        ))}
                      </View>
                    </View>
                    <CardSeparator />
                    <View style={styles.block}>
                      <ThemedText variant="body">
                        {t("backups_auto_keep")}
                      </ThemedText>
                      <View style={styles.pills}>
                        {BACKUP_KEEP_OPTIONS.map((option) => (
                          <Pill
                            key={option}
                            label={String(option)}
                            selected={keepCount === option}
                            onPress={() => setKeepCount(option)}
                            radius={radius.pill}
                          />
                        ))}
                      </View>
                    </View>
                  </>
                ) : null}
              </Card>
            </View>
          ) : null}

          {mode === "create" || autoEnabled
            ? BACKUP_SECTIONS.map((section, sectionIndex) => {
                return (
                  <View key={section.id} style={styles.section}>
                    <SectionLabel
                      isFirst={mode === "create" && sectionIndex === 0}
                    >
                      {t(section.titleKey)}
                    </SectionLabel>
                    <Card>
                      {section.items.map((key, index) => (
                        <View key={key}>
                          <View style={styles.row}>
                            <ThemedText variant="body" style={styles.rowText}>
                              {t(`backups_scope_${key}`)}
                            </ThemedText>
                            <Switch
                              value={scope[key]}
                              onValueChange={(value) => toggleKey(key, value)}
                            />
                          </View>
                          {index < section.items.length - 1 ? (
                            <CardSeparator />
                          ) : null}
                        </View>
                      ))}
                    </Card>
                  </View>
                );
              })
            : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Pill({
  label,
  selected,
  onPress,
  radius,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  radius: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          borderRadius: radius,
          backgroundColor: selected ? colors.tint : colors.secondaryFill,
        },
      ]}
    >
      <ThemedText variant="subheadline" color={selected ? "onTint" : "label"}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  section: {
    gap: Spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  block: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});
