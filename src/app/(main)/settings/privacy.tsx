import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";

import { Card, CardSeparator } from "@/components/ui/card";
import { ScreenContent } from "@/components/ui/screen-content";
import { SectionLabel } from "@/components/ui/section-label";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import {
  authenticateUser,
  isBiometricAuthAvailable,
} from "@/services/app-lock";
import { getAppSettings, updateAppSettings } from "@/services/app-settings";
import { subscribeAppSettings } from "@/utils/app-settings-events";

type SwitchRowProps = {
  label: string;
  hint: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
};

function SwitchRow({ label, hint, value, disabled, onChange }: SwitchRowProps) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchMeta}>
        <ThemedText variant="body">{label}</ThemedText>
        <ThemedText variant="caption1" color="secondaryLabel">
          {hint}
        </ThemedText>
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange} />
    </View>
  );
}

export default function PrivacySettingsScreen() {
  const [ready, setReady] = useState(false);
  const [incognito, setIncognito] = useState(false);
  const [showNsfwHistory, setShowNsfwHistory] = useState(true);
  const [requireBiometrics, setRequireBiometrics] = useState(false);
  const [separateNsfwSources, setSeparateNsfwSources] = useState(false);
  const [nsfwKillSwitch, setNsfwKillSwitch] = useState(false);
  const [hideCategorizedNsfwInAll, setHideCategorizedNsfwInAll] =
    useState(false);

  const load = useCallback(async () => {
    const settings = await getAppSettings();
    setIncognito(settings.incognitoMode);
    setShowNsfwHistory(settings.privacy.showNsfwHistory);
    setRequireBiometrics(settings.privacy.requireBiometrics);
    setSeparateNsfwSources(settings.privacy.separateNsfwSources);
    setNsfwKillSwitch(settings.privacy.nsfwKillSwitch);
    setHideCategorizedNsfwInAll(settings.privacy.hideCategorizedNsfwInAll);
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
    return subscribeAppSettings(() => void load());
  }, [load]);

  const toggleIncognito = (value: boolean) => {
    setIncognito(value);
    void updateAppSettings({ incognitoMode: value });
  };

  const toggleNsfwHistory = (value: boolean) => {
    setShowNsfwHistory(value);
    void updateAppSettings({
      privacy: {
        requireBiometrics,
        showNsfwHistory: value,
        separateNsfwSources,
        nsfwKillSwitch,
        hideCategorizedNsfwInAll,
      },
    });
  };

  const toggleSeparateNsfwSources = (value: boolean) => {
    setSeparateNsfwSources(value);
    void updateAppSettings({
      privacy: {
        requireBiometrics,
        showNsfwHistory,
        separateNsfwSources: value,
        nsfwKillSwitch,
        hideCategorizedNsfwInAll,
      },
    });
  };

  const toggleHideCategorizedNsfw = (value: boolean) => {
    setHideCategorizedNsfwInAll(value);
    void updateAppSettings({
      privacy: {
        requireBiometrics,
        showNsfwHistory,
        separateNsfwSources,
        nsfwKillSwitch,
        hideCategorizedNsfwInAll: value,
      },
    });
  };

  const toggleNsfwKillSwitch = (value: boolean) => {
    setNsfwKillSwitch(value);
    void updateAppSettings({
      privacy: {
        requireBiometrics,
        showNsfwHistory,
        separateNsfwSources,
        nsfwKillSwitch: value,
        hideCategorizedNsfwInAll,
      },
    });
  };

  const toggleBiometrics = async (value: boolean) => {
    if (!value) {
      setRequireBiometrics(false);
      await updateAppSettings({
        privacy: {
          requireBiometrics: false,
          showNsfwHistory,
          separateNsfwSources,
          nsfwKillSwitch,
          hideCategorizedNsfwInAll,
        },
      });
      return;
    }
    if (!(await isBiometricAuthAvailable())) {
      Alert.alert(
        t("app_lock_unavailable_title"),
        t("app_lock_unavailable_desc"),
      );
      return;
    }
    const ok = await authenticateUser(t("app_lock_prompt"), t("cancel"));
    if (!ok) return;
    setRequireBiometrics(true);
    await updateAppSettings({
      privacy: {
        requireBiometrics: true,
        showNsfwHistory,
        separateNsfwSources,
        nsfwKillSwitch,
        hideCategorizedNsfwInAll,
      },
    });
  };

  return (
    <>
      <Stack.Title>{t("section_privacy")}</Stack.Title>
      <ScreenContent>
        <SectionLabel isFirst>{t("settings_privacy_section")}</SectionLabel>
        <Card>
          <SwitchRow
            label={t("incognito_mode")}
            hint={t("incognito_mode_hint")}
            value={incognito}
            disabled={!ready}
            onChange={toggleIncognito}
          />
          <CardSeparator />
          <SwitchRow
            label={t("privacy_nsfw_history")}
            hint={t("privacy_nsfw_history_hint")}
            value={showNsfwHistory}
            disabled={!ready || nsfwKillSwitch}
            onChange={toggleNsfwHistory}
          />
          <CardSeparator />
          <SwitchRow
            label={t("privacy_separate_nsfw_sources")}
            hint={t("privacy_separate_nsfw_sources_hint")}
            value={separateNsfwSources}
            disabled={!ready || nsfwKillSwitch}
            onChange={toggleSeparateNsfwSources}
          />
          <CardSeparator />
          <SwitchRow
            label={t("privacy_nsfw_kill_switch")}
            hint={t("privacy_nsfw_kill_switch_hint")}
            value={nsfwKillSwitch}
            disabled={
              !ready ||
              (!nsfwKillSwitch && !(showNsfwHistory && separateNsfwSources))
            }
            onChange={toggleNsfwKillSwitch}
          />
          <CardSeparator />
          <SwitchRow
            label={t("privacy_hide_categorized_nsfw")}
            hint={t("privacy_hide_categorized_nsfw_hint")}
            value={hideCategorizedNsfwInAll}
            disabled={!ready}
            onChange={toggleHideCategorizedNsfw}
          />
        </Card>

        <SectionLabel>{t("privacy_security_section")}</SectionLabel>
        <Card>
          <SwitchRow
            label={t("privacy_biometrics")}
            hint={t("privacy_biometrics_hint")}
            value={requireBiometrics}
            disabled={!ready}
            onChange={(value) => void toggleBiometrics(value)}
          />
        </Card>
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
});
