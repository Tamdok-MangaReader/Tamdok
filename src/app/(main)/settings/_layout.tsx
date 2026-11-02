import { Stack } from "expo-router";

import { duoScreenLayout } from "@/hooks/use-duo-layout";
import { useNavigationTheme } from "@/hooks/use-navigation-theme";

export default function SettingsLayout() {
  const { stackScreenOptions } = useNavigationTheme();

  return (
    <Stack screenOptions={stackScreenOptions} screenLayout={duoScreenLayout}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="appearance"
        options={{ headerLargeTitle: false, title: "" }}
      />
      <Stack.Screen
        name="privacy"
        options={{ headerLargeTitle: false, title: "" }}
      />
      <Stack.Screen
        name="statistics"
        options={{ headerLargeTitle: false, title: "" }}
      />
      <Stack.Screen
        name="notifications"
        options={{ headerLargeTitle: false, title: "" }}
      />
      <Stack.Screen
        name="sources"
        options={{ headerLargeTitle: false, title: "" }}
      />
      <Stack.Screen
        name="source/[sourceId]"
        options={{ headerLargeTitle: false, title: "" }}
      />
      <Stack.Screen
        name="library"
        options={{ headerLargeTitle: false, title: "" }}
      />
      <Stack.Screen
        name="reader"
        options={{ headerLargeTitle: false, title: "" }}
      />
      <Stack.Screen
        name="downloads"
        options={{ headerLargeTitle: false, title: "" }}
      />
      <Stack.Screen
        name="backups"
        options={{ headerLargeTitle: false, title: "" }}
      />
      <Stack.Screen
        name="advanced"
        options={{ headerLargeTitle: false, title: "" }}
      />
    </Stack>
  );
}
