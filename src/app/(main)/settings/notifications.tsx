import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Switch,
  View,
} from "react-native";

import { MenuPickerRow } from "@/components/ui/menu-picker-row";
import { Card, CardSeparator } from "@/components/ui/card";
import { ScreenContent } from "@/components/ui/screen-content";
import { SectionLabel } from "@/components/ui/section-label";
import { SectionFooter } from "@/components/ui/section-footer";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { isBackgroundUpdateAvailable } from "@/services/background-library-update";
import {
  getLibraryUpdateSettings,
  updateLibraryUpdateSettings,
  type LibraryUpdateInterval,
} from "@/services/library";
import {
  getNotifyNewChapters,
  getNotifySourceUpdates,
  requestNotificationPermissions,
  setNotifyNewChapters,
  setNotifySourceUpdates,
} from "@/services/notifications";

const INTERVAL_OPTIONS: Exclude<LibraryUpdateInterval, "never">[] = [
  "1h",
  "6h",
  "12h",
  "24h",
  "48h",
];

export default function NotificationsSettingsScreen() {
  const [sourceUpdates, setSourceUpdates] = useState(true);
  const [newChapters, setNewChapters] = useState(false);
  const [interval, setIntervalValue] = useState<LibraryUpdateInterval>("12h");
  const [backgroundAvailable, setBackgroundAvailable] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [updates, chapters, settings, available] = await Promise.all([
        getNotifySourceUpdates(),
        getNotifyNewChapters(),
        getLibraryUpdateSettings(),
        isBackgroundUpdateAvailable(),
      ]);
      setSourceUpdates(updates);
      setNewChapters(chapters);
      setIntervalValue(settings.updateInterval);
      setBackgroundAvailable(available);
      setIsLoading(false);
    })();
  }, []);

  const intervalOptions = useMemo(
    () =>
      INTERVAL_OPTIONS.map((id) => ({
        id,
        label: t(`library_update_interval_${id}`),
      })),
    [],
  );

  const showPermissionAlert = useCallback(() => {
    Alert.alert(
      t("settings_notifications_permission_title"),
      t("settings_notifications_permission_desc"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("settings_notifications_open_settings"),
          onPress: () => void Linking.openSettings(),
        },
      ],
    );
  }, []);

  const toggleSourceUpdates = async (value: boolean) => {
    if (value && !(await requestNotificationPermissions())) {
      showPermissionAlert();
      return;
    }
    const saved = await setNotifySourceUpdates(value);
    setSourceUpdates(saved);
  };

  const toggleNewChapters = async (value: boolean) => {
    if (value && !(await requestNotificationPermissions())) {
      showPermissionAlert();
      return;
    }
    const saved = await setNotifyNewChapters(value);
    setNewChapters(saved);
    if (saved) {
      const settings = await getLibraryUpdateSettings();
      setIntervalValue(settings.updateInterval);
      setBackgroundAvailable(await isBackgroundUpdateAvailable());
    }
  };

  const selectInterval = (id: string) => {
    const next = id as LibraryUpdateInterval;
    setIntervalValue(next);
    void updateLibraryUpdateSettings({ updateInterval: next });
  };

  return (
    <>
      <Stack.Screen options={{ title: t("section_notifications") }} />
      <ScreenContent>
        <SectionLabel isFirst>
          {t("settings_notifications_section")}
        </SectionLabel>
        <Card>
          <View style={styles.switchRow}>
            <View style={styles.switchMeta}>
              <ThemedText variant="body">
                {t("settings_notifications_new_chapters")}
              </ThemedText>
              <ThemedText variant="caption1" color="secondaryLabel">
                {t("settings_notifications_new_chapters_hint")}
              </ThemedText>
            </View>
            <Switch
              accessibilityLabel={t("settings_notifications_new_chapters")}
              value={newChapters}
              disabled={isLoading}
              onValueChange={(value) => void toggleNewChapters(value)}
            />
          </View>
          <CardSeparator />
          <View style={styles.switchRow}>
            <View style={styles.switchMeta}>
              <ThemedText variant="body">
                {t("settings_notifications_source_updates")}
              </ThemedText>
              <ThemedText variant="caption1" color="secondaryLabel">
                {t("settings_notifications_source_updates_hint")}
              </ThemedText>
            </View>
            <Switch
              accessibilityLabel={t("settings_notifications_source_updates")}
              value={sourceUpdates}
              disabled={isLoading}
              onValueChange={(value) => void toggleSourceUpdates(value)}
            />
          </View>
        </Card>

        {newChapters && (
          <>
            <SectionLabel>{t("settings_notifications_interval")}</SectionLabel>
            <Card>
              <MenuPickerRow
                label={t("settings_notifications_interval")}
                options={intervalOptions}
                selectedId={interval}
                onSelect={selectInterval}
                isFirst
                isLast
              />
            </Card>
            <SectionFooter>
              {t("settings_notifications_interval_hint")}
            </SectionFooter>
            {!backgroundAvailable && Platform.OS === "ios" && (
              <ThemedText
                variant="caption1"
                color="destructive"
                style={styles.footer}
              >
                {t("settings_notifications_background_restricted")}
              </ThemedText>
            )}
          </>
        )}

        {Platform.OS === "ios" && (
          <ThemedText
            variant="caption1"
            color="tertiaryLabel"
            style={styles.footer}
          >
            {t("settings_notifications_ios_footer")}
          </ThemedText>
        )}
      </ScreenContent>
    </>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  switchMeta: {
    flex: 1,
    gap: Spacing.xs,
  },
  intervalCard: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  footer: {
    paddingHorizontal: Spacing.sm,
  },
});
