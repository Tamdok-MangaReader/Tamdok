import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, View, Switch } from "react-native";
import SegmentedControl from "@react-native-segmented-control/segmented-control";

import { AccentColorPicker } from "@/components/settings/accent-color-picker";
import { AppIconPicker } from "@/components/settings/app-icon-picker";
import { Card, CardSeparator } from "@/components/ui/card";
import { ScreenContent } from "@/components/ui/screen-content";
import { SectionFooter } from "@/components/ui/section-footer";
import { SectionLabel } from "@/components/ui/section-label";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import type { AccentColorId } from "@/constants/accent-colors";
import type { AppIconId } from "@/constants/app-icons";
import { useAppearance } from "@/context/appearance-context";
import {
  AppThemeMode,
  useThemePreference,
} from "@/context/theme-preference-context";
import {
  getAppSettings,
  CoverDisplaySettings,
  MangaScreenSettings,
  TabBadgeSettings,
  TabBarHideSettings,
  updateAppSettings,
} from "@/services/app-settings";
import type { ComponentType } from "react";

// The library ships class-component typings that do not satisfy the current JSX types.
const NativeSegmented = SegmentedControl as unknown as ComponentType<{
  values: string[];
  selectedIndex: number;
  appearance: "light" | "dark";
  style?: object;
  onChange: (event: { nativeEvent: { selectedSegmentIndex: number } }) => void;
}>;

const THEME_MODES: AppThemeMode[] = ["system", "light", "dark"];

export default function AppearanceScreen() {
  const { themeMode, setThemeMode, resolvedColorScheme } = useThemePreference();
  const {
    accentColorId,
    appIconId,
    setAccentColorId,
    setAppIconId,
    appIconSupported,
  } = useAppearance();
  const isDark = resolvedColorScheme === "dark";
  const selectedIndex = THEME_MODES.indexOf(themeMode);
  const [showBigMangaCover, setShowBigMangaCover] = useState(true);
  const [stretchMangaCover, setStretchMangaCover] = useState(true);
  const [showChapterNumber, setShowChapterNumber] = useState(true);
  const [showStatusBadge, setShowStatusBadge] = useState(true);
  const [showFinishedBadge, setShowFinishedBadge] = useState(true);
  const [showRating, setShowRating] = useState(true);
  const [tabBadges, setTabBadges] = useState<TabBadgeSettings>({
    sourceUpdates: true,
    libraryUnread: true,
    libraryUnreadUpdatableOnly: true,
    libraryUnreadMangaCount: false,
  });

  const [tabBarHide, setTabBarHide] = useState<TabBarHideSettings>({
    library: true,
    sources: true,
    history: true,
    settings: false,
  });

  const load = useCallback(async () => {
    const settings = await getAppSettings();
    setShowBigMangaCover(settings.mangaScreen.showBigMangaCover);
    setStretchMangaCover(settings.mangaScreen.stretchMangaCover);
    setShowChapterNumber(settings.mangaScreen.showChapterNumber);
    setShowStatusBadge(settings.coverDisplay.showStatusBadge);
    setShowFinishedBadge(settings.coverDisplay.showFinishedBadge);
    setShowRating(settings.coverDisplay.showRating);
    setTabBadges(settings.tabBadges);
    setTabBarHide(settings.tabBarHide);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateMangaScreenSettings = (next: Partial<MangaScreenSettings>) => {
    void getAppSettings().then((settings) =>
      updateAppSettings({
        mangaScreen: { ...settings.mangaScreen, ...next },
      }),
    );
  };

  const updateCoverDisplaySettings = (next: Partial<CoverDisplaySettings>) => {
    void getAppSettings().then((settings) =>
      updateAppSettings({
        coverDisplay: { ...settings.coverDisplay, ...next },
      }),
    );
  };

  const updateTabBadges = (next: Partial<TabBadgeSettings>) => {
    setTabBadges((previous) => ({ ...previous, ...next }));
    void updateAppSettings({ tabBadges: next });
  };

  const updateTabBarHide = (next: Partial<TabBarHideSettings>) => {
    setTabBarHide((previous) => ({ ...previous, ...next }));
    void updateAppSettings({ tabBarHide: next });
  };

  const handleAppIconSelect = (id: AppIconId) => {
    if (Platform.OS !== "ios") {
      Alert.alert(t("app_icon_ios_only_title"), t("app_icon_ios_only_desc"));
      return;
    }
    if (!appIconSupported) {
      Alert.alert(
        t("app_icon_unavailable_title"),
        t("app_icon_unavailable_desc"),
      );
      return;
    }
    void setAppIconId(id);
  };

  function SwitchRow({
    label,
    hint,
    value,
    onChange,
    isFirst,
    isLast,
    disabled,
  }: {
    label: string;
    hint?: string;
    value: boolean;
    onChange: (value: boolean) => void;
    isFirst?: boolean;
    isLast?: boolean;
    disabled?: boolean;
  }) {
    return (
      <View
        style={[
          styles.switchRow,
          isFirst && { paddingTop: Spacing.lg },
          isLast && { paddingBottom: Spacing.lg },
          disabled && { opacity: 0.4 },
        ]}
      >
        <View style={styles.switchText}>
          <ThemedText variant="body">{label}</ThemedText>
          {hint ? (
            <ThemedText variant="footnote" color="secondaryLabel">
              {hint}
            </ThemedText>
          ) : null}
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          accessibilityLabel={label}
        />
      </View>
    );
  }

  return (
    <>
      <Stack.Title>{t("section_appearance")}</Stack.Title>
      <ScreenContent>
        <SectionLabel>{t("theme")}</SectionLabel>
        <NativeSegmented
          values={[t("theme_system"), t("theme_light"), t("theme_dark")]}
          appearance={isDark ? "dark" : "light"}
          selectedIndex={selectedIndex}
          style={styles.segmented}
          onChange={(event) => {
            const index = event.nativeEvent.selectedSegmentIndex;
            void setThemeMode(THEME_MODES[index] ?? "system");
          }}
        />
        <SectionFooter>{t(`theme_${themeMode}_hint`)}</SectionFooter>

        <SectionLabel>{t("appearance_accent_section")}</SectionLabel>
        <Card style={styles.card}>
          <AccentColorPicker
            selectedId={accentColorId}
            onSelect={(id: AccentColorId) => {
              void setAccentColorId(id);
            }}
          />
        </Card>
        <SectionFooter>{t("appearance_accent_hint")}</SectionFooter>

        <SectionLabel>{t("appearance_app_icon_section")}</SectionLabel>
        <Card style={styles.card}>
          <AppIconPicker
            selectedId={appIconId}
            onSelect={handleAppIconSelect}
          />
        </Card>
        <SectionFooter>{t("appearance_app_icon_hint")}</SectionFooter>

        <SectionLabel>{t("appearance_tab_badges_section")}</SectionLabel>
        <Card>
          <SwitchRow
            label={t("appearance_badge_sources")}
            hint={t("appearance_badge_sources_hint")}
            value={tabBadges.sourceUpdates}
            onChange={(value) => updateTabBadges({ sourceUpdates: value })}
            isFirst
          />
          <CardSeparator />
          <SwitchRow
            label={t("appearance_badge_library")}
            hint={t("appearance_badge_library_hint")}
            value={tabBadges.libraryUnread}
            onChange={(value) => updateTabBadges({ libraryUnread: value })}
          />
          <CardSeparator />
          <SwitchRow
            label={t("appearance_badge_library_manga")}
            hint={t("appearance_badge_library_manga_hint")}
            value={tabBadges.libraryUnreadMangaCount}
            onChange={(value) =>
              updateTabBadges({ libraryUnreadMangaCount: value })
            }
            disabled={!tabBadges.libraryUnread}
          />
          <CardSeparator />
          <SwitchRow
            label={t("appearance_badge_library_updatable")}
            hint={t("appearance_badge_library_updatable_hint")}
            value={tabBadges.libraryUnreadUpdatableOnly}
            onChange={(value) =>
              updateTabBadges({ libraryUnreadUpdatableOnly: value })
            }
            disabled={!tabBadges.libraryUnread}
            isLast
          />
        </Card>

        <SectionLabel>{t("appearance_hide_nav_section")}</SectionLabel>
        <Card>
          <SwitchRow
            label={t("library")}
            value={tabBarHide.library}
            onChange={(value) => updateTabBarHide({ library: value })}
            isFirst
          />
          <CardSeparator />
          <SwitchRow
            label={t("sources")}
            value={tabBarHide.sources}
            onChange={(value) => updateTabBarHide({ sources: value })}
          />
          <CardSeparator />
          <SwitchRow
            label={t("history")}
            value={tabBarHide.history}
            onChange={(value) => updateTabBarHide({ history: value })}
          />
          <CardSeparator />
          <SwitchRow
            label={t("settings")}
            value={tabBarHide.settings}
            onChange={(value) => updateTabBarHide({ settings: value })}
            isLast
          />
        </Card>
        <SectionFooter>{t("appearance_hide_nav_footer")}</SectionFooter>

        <SectionLabel>{t("appearance_covers_section")}</SectionLabel>
        <Card>
          <SwitchRow
            label={t("appearance_show_status")}
            hint={t("appearance_show_status_hint")}
            value={showStatusBadge}
            onChange={(value) => {
              setShowStatusBadge(value);
              updateCoverDisplaySettings({ showStatusBadge: value });
            }}
            isFirst
          />
          <CardSeparator />
          <SwitchRow
            label={t("appearance_show_finished")}
            hint={t("appearance_show_finished_hint")}
            value={showFinishedBadge}
            onChange={(value) => {
              setShowFinishedBadge(value);
              updateCoverDisplaySettings({ showFinishedBadge: value });
            }}
          />
          <CardSeparator />
          <SwitchRow
            label={t("appearance_show_rating")}
            hint={t("appearance_show_rating_hint")}
            value={showRating}
            onChange={(value) => {
              setShowRating(value);
              updateCoverDisplaySettings({ showRating: value });
            }}
            isLast
          />
        </Card>

        <SectionLabel>{t("library_manga_screen_section")}</SectionLabel>
        <Card>
          <SwitchRow
            label={t("show_big_manga_cover")}
            value={showBigMangaCover}
            onChange={(value) => {
              setShowBigMangaCover(value);
              updateMangaScreenSettings({ showBigMangaCover: value });
            }}
            isFirst
          />
          <CardSeparator />
          <SwitchRow
            label={t("stretch_manga_cover")}
            value={stretchMangaCover}
            onChange={(value) => {
              setStretchMangaCover(value);
              updateMangaScreenSettings({ stretchMangaCover: value });
            }}
          />
          <CardSeparator />
          <SwitchRow
            label={t("show_chapter_number")}
            value={showChapterNumber}
            onChange={(value) => {
              setShowChapterNumber(value);
              updateMangaScreenSettings({ showChapterNumber: value });
            }}
            isLast
          />
        </Card>
      </ScreenContent>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  segmented: {
    height: 36,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
});
