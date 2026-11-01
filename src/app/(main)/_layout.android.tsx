import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useMemo } from "react";
import { Dimensions, useWindowDimensions } from "react-native";

import { t } from "@/constants/locales";
import { useNavigationTheme } from "@/hooks/use-navigation-theme";
import { useIsOpenDuo } from "@/hooks/use-duo-layout";
import { useTheme } from "@/hooks/use-theme";
import { formatBadge, useTabBadges } from "@/hooks/use-tab-badges";

// Android: Material bottom navigation. Icons use Material Symbols names (`md`),
// iOS-only props (sf symbols, roles, minimizeBehavior) are intentionally omitted.
function PhoneTabs() {
  const { tabTintColor, tabIconColor } = useNavigationTheme();
  const badges = useTabBadges();
  // The bar otherwise follows the system theme; colors are set explicitly so it matches the app theme.
  const { colors } = useTheme();

  const tabIconColors = useMemo(
    () => ({ default: tabIconColor, selected: tabTintColor }),
    [tabIconColor, tabTintColor],
  );

  return (
    <NativeTabs
      tintColor={tabTintColor}
      iconColor={tabIconColors}
      backgroundColor={colors.secondarySystemBackground}
      indicatorColor={`${tabTintColor}33`}
      labelStyle={{ default: { color: colors.secondaryLabel }, selected: { color: tabTintColor } }}
    >
      <NativeTabs.Trigger name="(library)">
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

const TAB_ITEMS: {
  name: string;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: "library" | "sources";
}[] = [
  { name: "index", labelKey: "library", icon: "library", badge: "library" },
  { name: "sources", labelKey: "sources", icon: "globe", badge: "sources" },
  { name: "history", labelKey: "history", icon: "time" },
  { name: "settings", labelKey: "settings", icon: "settings" },
  { name: "search", labelKey: "search", icon: "search" },
];

// Tablet: vertical navigation rail on the left.
function TabletTabs() {
  const { tabTintColor, tabIconColor } = useNavigationTheme();
  const badges = useTabBadges();
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: "left",
        tabBarVariant: "material",
        tabBarLabelPosition: "below-icon",
        tabBarActiveTintColor: tabTintColor,
        tabBarInactiveTintColor: tabIconColor,
        tabBarStyle: { backgroundColor: colors.secondarySystemBackground },
      }}
    >
      {TAB_ITEMS.map((item) => {
        const count = item.badge ? badges[item.badge] : 0;
        return (
          <Tabs.Screen
            key={item.name}
            name={item.name}
            options={{
              title: t(item.labelKey as never),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name={item.icon} size={size} color={color as string} />
              ),
              tabBarBadge: count > 0 ? formatBadge(count) : undefined,
            }}
          />
        );
      })}
      <Tabs.Screen name="[...unmatched]" options={{ href: null }} />
    </Tabs>
  );
}

export default function MainTabLayout() {
  const tablet = useIsOpenDuo();
  const { width, height } = useWindowDimensions();
  // The left rail is used only in landscape; portrait keeps the bottom bar.
  const landscape = width > height;
  // Manifest allows any orientation; phones stay portrait, tablets (>= 600dp short side) rotate freely.
  useEffect(() => {
    const { width, height } = Dimensions.get("screen");
    const lock =
      Math.min(width, height) >= 600
        ? ScreenOrientation.OrientationLock.DEFAULT
        : ScreenOrientation.OrientationLock.PORTRAIT_UP;
    ScreenOrientation.lockAsync(lock).catch(() => {});
  }, []);

  return tablet && landscape ? <TabletTabs /> : <PhoneTabs />;
}
