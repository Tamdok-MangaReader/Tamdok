import { Stack } from "expo-router";
import type { ComponentProps } from "react";

import { duoScreenLayout } from "@/hooks/use-duo-layout";
import { useNavigationTheme } from "@/hooks/use-navigation-theme";

// The manga page itself ignores the Duo rail.
const mangaScreenLayout: ComponentProps<typeof Stack>["screenLayout"] = (
  props,
) => (props.route.name === "detail" ? props.children : duoScreenLayout(props));

export default function MangaLayout() {
  const { stackScreenOptions } = useNavigationTheme();

  return (
    <Stack
      screenLayout={mangaScreenLayout}
      screenOptions={{
        ...stackScreenOptions,
        headerLargeTitle: false,
        freezeOnBlur: true,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="detail" options={{ title: "" }} />
      <Stack.Screen name="transfer" options={{ title: "" }} />
    </Stack>
  );
}
