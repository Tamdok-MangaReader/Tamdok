import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";

/**
 * In-app loading screen. The native splash is only a blank screen in the same background color
 * (a native splash cannot show a spinner), so this view takes over without a visible jump.
 */
export function AppSplash() {
  const { colors } = useTheme();

  // expo-router keeps the native splash up until the first navigator renders, which would cover
  // this screen. Drop it as soon as this one is on screen (same background color, so no jump).
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.systemBackground }]}>
      <Text style={[styles.title, { color: colors.label }]}>탐독</Text>
      <ActivityIndicator size="large" color={colors.secondaryLabel} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 72, fontWeight: "800", letterSpacing: 2 },
  spinner: { marginTop: 32 },
});
