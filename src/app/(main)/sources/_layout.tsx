import { Stack } from "expo-router";

import { duoScreenLayout } from "@/hooks/use-duo-layout";
import { useNavigationTheme } from "@/hooks/use-navigation-theme";

export default function SourcesLayout() {
  const { stackScreenOptions } = useNavigationTheme();

  return (
    <Stack screenOptions={stackScreenOptions} screenLayout={duoScreenLayout}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[id]/index"
        options={{
          headerLargeTitle: false,
          title: "",
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <Stack.Screen
        name="[id]/settings"
        options={{ headerLargeTitle: false, title: "" }}
      />
      <Stack.Screen
        name="[id]/search"
        options={{
          headerLargeTitle: false,
          title: "",
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <Stack.Screen
        name="[id]/listing"
        options={{
          headerLargeTitle: false,
          title: "",
          headerBackButtonDisplayMode: "minimal",
        }}
      />
    </Stack>
  );
}
