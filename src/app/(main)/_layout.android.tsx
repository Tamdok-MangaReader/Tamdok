import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useMemo } from "react";

import { t } from "@/constants/locales";
import { useNavigationTheme } from "@/hooks/use-navigation-theme";
import { formatBadge, useTabBadges } from "@/hooks/use-tab-badges";

// Android: Material bottom navigation. Icons use Material Symbols names (`md`),
// iOS-only props (sf symbols, roles, minimizeBehavior) are intentionally omitted.
export default function MainTabLayout() {
  const { tabTintColor, tabIconColor } = useNavigationTheme();
  const badges = useTabBadges();

  const tabIconColors = useMemo(
    () => ({ default: tabIconColor, selected: tabTintColor }),
    [tabIconColor, tabTintColor],
  );

  return (
    <NativeTabs tintColor={tabTintColor} iconColor={tabIconColors}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t("library")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="collections_bookmark" />
        <NativeTabs.Trigger.Badge hidden={badges.library <= 0}>
          {badges.library > 0 ? formatBadge(badges.library) : undefined}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="sources">
        <NativeTabs.Trigger.Label>{t("sources")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="public" />
        <NativeTabs.Trigger.Badge hidden={badges.sources <= 0}>
          {badges.sources > 0 ? formatBadge(badges.sources) : undefined}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Label>{t("history")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="history" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{t("settings")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="settings" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Label>{t("search")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="search" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="[...unmatched]" hidden />
    </NativeTabs>
  );
}
