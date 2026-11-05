import { Stack } from "expo-router";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
import type { InstalledSource } from "@/parsers/shared/types";
import { useSources } from "@/context/sources-context";
import {
  DEFAULT_SETTINGS,
  getAppSettings,
  updateAppSettings,
  type PrivacySettings,
} from "@/services/app-settings";
import { getLibraryEntries } from "@/services/library";
import { getHistorySourceIds } from "@/services/manga-tracking";
import { findInstalledSource } from "@/services/sources";
import { subscribeAppSettings } from "@/utils/app-settings-events";

const DEFAULT_PRIVACY_SETTINGS = DEFAULT_SETTINGS.privacy;

function isNsfwSource(source: InstalledSource): boolean {
  return (source.manifest.info.contentRating ?? 0) >= 3;
}

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
  const { installed } = useSources();
  const [ready, setReady] = useState(false);
  const [incognito, setIncognito] = useState(false);
  const [privacy, setPrivacy] = useState<PrivacySettings>(
    DEFAULT_PRIVACY_SETTINGS,
  );
  const [hasNsfwHistory, setHasNsfwHistory] = useState(false);
  const [hasNsfwLibrary, setHasNsfwLibrary] = useState(false);

  const hasNsfwSources = useMemo(
    () => installed.some(isNsfwSource),
    [installed],
  );

  const load = useCallback(async () => {
    const settings = await getAppSettings();
    setIncognito(settings.incognitoMode);
    setPrivacy(settings.privacy);
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
    return subscribeAppSettings(() => void load());
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getHistorySourceIds(), getLibraryEntries()]).then(
      ([history, library]) => {
        if (cancelled) return;
        const isNsfw = (sourceId: string) => {
          const source = findInstalledSource(installed, sourceId);
          return source ? isNsfwSource(source) : false;
        };
        setHasNsfwHistory(history.some((sourceId) => isNsfw(sourceId)));
        setHasNsfwLibrary(library.some((entry) => isNsfw(entry.sourceId)));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [installed]);

  const updatePrivacy = (patch: Partial<PrivacySettings>) => {
    setPrivacy((current) => ({ ...current, ...patch }));
    void updateAppSettings({ privacy: { ...privacy, ...patch } });
  };

  const toggleIncognito = (value: boolean) => {
    setIncognito(value);
    void updateAppSettings({ incognitoMode: value });
  };

  const toggleBiometrics = async (value: boolean) => {
    if (!value) {
      updatePrivacy({ requireBiometrics: false });
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
    updatePrivacy({ requireBiometrics: true });
  };

  const { nsfwKillSwitch } = privacy;
  const showSourcesRow = hasNsfwSources || privacy.separateNsfwSources;
  const showHistoryRows = hasNsfwHistory;
  const showLibraryRow = hasNsfwLibrary || privacy.hideCategorizedNsfwInAll;
  const showKillSwitch =
    showSourcesRow || showHistoryRows || showLibraryRow || nsfwKillSwitch;

  const rows: ReactNode[] = [
    <SwitchRow
      key="incognito"
      label={t("incognito_mode")}
      hint={t("incognito_mode_hint")}
      value={incognito}
      disabled={!ready}
      onChange={toggleIncognito}
    />,
  ];
  if (showHistoryRows) {
    rows.push(
      <SwitchRow
        key="history"
        label={t("privacy_nsfw_history")}
        hint={t("privacy_nsfw_history_hint")}
        value={privacy.showNsfwHistory}
        disabled={!ready || nsfwKillSwitch}
        onChange={(value) => updatePrivacy({ showNsfwHistory: value })}
      />,
      <SwitchRow
        key="history-separate"
        label={t("privacy_separate_nsfw_history")}
        hint={t("privacy_separate_nsfw_history_hint")}
        value={privacy.separateNsfwHistory}
        disabled={!ready || nsfwKillSwitch || !privacy.showNsfwHistory}
        onChange={(value) => updatePrivacy({ separateNsfwHistory: value })}
      />,
    );
  }
  if (showSourcesRow) {
    rows.push(
      <SwitchRow
        key="sources"
        label={t("privacy_separate_nsfw_sources")}
        hint={t("privacy_separate_nsfw_sources_hint")}
        value={privacy.separateNsfwSources}
        disabled={!ready || nsfwKillSwitch}
        onChange={(value) => updatePrivacy({ separateNsfwSources: value })}
      />,
    );
  }
  if (showKillSwitch) {
    rows.push(
      <SwitchRow
        key="kill"
        label={t("privacy_nsfw_kill_switch")}
        hint={t("privacy_nsfw_kill_switch_hint")}
        value={nsfwKillSwitch}
        disabled={
          !ready ||
          (!nsfwKillSwitch &&
            !(privacy.showNsfwHistory && privacy.separateNsfwSources))
        }
        onChange={(value) => updatePrivacy({ nsfwKillSwitch: value })}
      />,
    );
  }
  if (showLibraryRow) {
    rows.push(
      <SwitchRow
        key="library"
        label={t("privacy_hide_categorized_nsfw")}
        hint={t("privacy_hide_categorized_nsfw_hint")}
        value={privacy.hideCategorizedNsfwInAll}
        disabled={!ready}
        onChange={(value) => updatePrivacy({ hideCategorizedNsfwInAll: value })}
      />,
    );
  }

  return (
    <>
      <Stack.Title>{t("section_privacy")}</Stack.Title>
      <ScreenContent>
        <SectionLabel isFirst>{t("settings_privacy_section")}</SectionLabel>
        <Card>
          {rows.map((row, index) => (
            <Fragment key={(row as { key: string }).key}>
              {index > 0 ? <CardSeparator /> : null}
              {row}
            </Fragment>
          ))}
        </Card>

        <SectionLabel>{t("privacy_security_section")}</SectionLabel>
        <Card>
          <SwitchRow
            label={t("privacy_biometrics")}
            hint={t("privacy_biometrics_hint")}
            value={privacy.requireBiometrics}
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
