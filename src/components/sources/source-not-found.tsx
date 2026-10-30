import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { EmptyState } from "@/components/ui/empty-state";
import { GlassButton } from "@/components/ui/glass-button";
import { ScreenContent } from "@/components/ui/screen-content";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";

export function SourceNotFound() {
  const router = useRouter();

  return (
    <ScreenContent centerContent>
      <View style={styles.body}>
        <EmptyState icon="alert-circle-outline" title={t("sources_not_found")} />
        <GlassButton
          label={t("back")}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        />
      </View>
    </ScreenContent>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
});
