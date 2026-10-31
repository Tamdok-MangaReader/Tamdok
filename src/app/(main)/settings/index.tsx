import { Stack, useRouter, type Href } from "expo-router";
import Constants from "expo-constants";
import { Image } from "expo-image";
import * as MailComposer from "expo-mail-composer";
import { Linking, StyleSheet, View } from "react-native";

import { AppIcon } from "@/components/branding/app-icon";
import { Card, CardSeparator } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { ScreenContent } from "@/components/ui/screen-content";
import { SectionLabel } from "@/components/ui/section-label";
import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useTheme } from "@/hooks/use-theme";

const GITHUB_URL = "https://github.com/Tamdok-MangaReader/Tamdok";

function firstVersionPart(
  ...values: Array<string | number | null | undefined>
): string {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "—";
}

const MENU_ITEMS_FIRST = [
  {
    icon: "color-palette" as const,
    color: "#007AFF",
    labelKey: "section_appearance",
    path: "/settings/appearance",
  },
  {
    icon: "library" as const,
    color: "#FF9500",
    labelKey: "library_settings_title",
    path: "/settings/library",
  },
  {
    icon: "book" as const,
    color: "#AF52DE",
    labelKey: "reader_settings_title",
    path: "/settings/reader",
  },
  {
    icon: "globe" as const,
    color: "#34C759",
    labelKey: "section_sources",
    path: "/settings/sources",
  },
];

const MENU_ITEMS_SECOND = [
  {
    icon: "download" as const,
    color: "#5AC8FA",
    labelKey: "downloads_settings_title",
    path: "/settings/downloads",
  },
  {
    icon: "cloud-upload" as const,
    color: "#5856D6",
    labelKey: "backups_settings_title",
    path: "/settings/backups",
  },
];

const MENU_ITEMS_THIRD = [
  {
    icon: "lock-closed" as const,
    color: "#8E8E93",
    labelKey: "section_privacy",
    path: "/settings/privacy",
  },
  {
    icon: "notifications" as const,
    color: "#FF3B30",
    labelKey: "section_notifications",
    path: "/settings/notifications",
  },
  {
    icon: "construct" as const,
    color: "#636366",
    labelKey: "advanced_settings_title",
    path: "/settings/advanced",
  },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const appVersion = firstVersionPart(
    Constants.nativeAppVersion,
    Constants.expoConfig?.version,
  );
  const buildNumber = firstVersionPart(
    Constants.nativeBuildVersion,
    Constants.platform?.ios?.buildNumber,
    Constants.expoConfig?.ios?.buildNumber,
    Constants.expoConfig?.android?.versionCode,
  );
  const openEmail = async () => {
    if (await MailComposer.isAvailableAsync()) {
      MailComposer.composeAsync({
        recipients: ["me@sleaf.dev"],
        subject: "Tamdok",
      });
    } else {
      Linking.openURL("mailto:me@sleaf.dev");
    }
  };

  return (
    <>
      <Stack.Title large>{t("settings")}</Stack.Title>
      <ScreenContent>
        <Card style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <AppIcon />
          </View>
          <View style={styles.appMeta}>
            <ThemedText variant="title2" style={styles.appName}>
              {t("app_name")}
            </ThemedText>
            <View style={styles.pillRow}>
              <View
                style={[
                  styles.pill,
                  { backgroundColor: colors.secondaryFill, borderRadius: radius.pill },
                ]}
              >
                <ThemedText variant="footnote" color="secondaryLabel">
                  {t("app_version")} {appVersion}
                </ThemedText>
              </View>
              <View
                style={[
                  styles.pill,
                  { backgroundColor: colors.secondaryFill, borderRadius: radius.pill },
                ]}
              >
                <ThemedText variant="footnote" color="secondaryLabel">
                  {t("app_build")} {buildNumber}
                </ThemedText>
              </View>
            </View>
          </View>
        </Card>

        <SectionLabel isFirst>{t("settings_sections")}</SectionLabel>
        <Card>
          {MENU_ITEMS_FIRST.map((item, index) => (
            <View key={item.path}>
              <ListRow
                icon={item.icon}
                iconBackground={item.color}
                label={t(item.labelKey)}
                onPress={() => router.navigate(item.path as Href)}
                isFirst={index === 0}
                isLast={index === MENU_ITEMS_FIRST.length - 1}
              />
              {index < MENU_ITEMS_FIRST.length - 1 && <CardSeparator />}
            </View>
          ))}
        </Card>

        <Card>
          {MENU_ITEMS_SECOND.map((item, index) => (
            <View key={item.path}>
              <ListRow
                icon={item.icon}
                iconBackground={item.color}
                label={t(item.labelKey)}
                onPress={() => router.navigate(item.path as Href)}
                isFirst={index === 0}
                isLast={index === MENU_ITEMS_SECOND.length - 1}
              />
              {index < MENU_ITEMS_SECOND.length - 1 && <CardSeparator />}
            </View>
          ))}
        </Card>

        <Card>
          {MENU_ITEMS_THIRD.map((item, index) => (
            <View key={item.path}>
              <ListRow
                icon={item.icon}
                iconBackground={item.color}
                label={t(item.labelKey)}
                onPress={() => router.navigate(item.path as Href)}
                isFirst={index === 0}
                isLast={index === MENU_ITEMS_THIRD.length - 1}
              />
              {index < MENU_ITEMS_THIRD.length - 1 && <CardSeparator />}
            </View>
          ))}
        </Card>

        <SectionLabel>{t("support")}</SectionLabel>
        <Card>
          <View style={styles.authorRow}>
            <Image
              style={[styles.authorAvatar, { borderRadius: radius.lg }]}
              source={require("@/assets/images/SolsticeLeaf.png")}
            />
            <View style={styles.authorMeta}>
              <ThemedText variant="body" style={styles.authorTitle}>
                SolsticeLeaf
              </ThemedText>
              <ThemedText variant="footnote" color="secondaryLabel">
                me@sleaf.dev
              </ThemedText>
            </View>
          </View>
          <CardSeparator />
          <ListRow
            icon="mail"
            iconBackground="#007AFF"
            label={t("contact_email")}
            onPress={openEmail}
          />
          <CardSeparator />
          <ListRow
            icon="logo-github"
            iconBackground="#24292F"
            label="GitHub"
            onPress={() => void Linking.openURL(GITHUB_URL)}
            isLast
          />
        </Card>
        <View style={styles.footer}>
          <ThemedText variant="footnote" color="secondaryLabel">
            {t("made_with_love_prefix")}
          </ThemedText>
          <SFSymbolIcon
            name="heart.fill"
            size={13}
            color="#FF3B30"
            fallback="heart"
            weight="semibold"
          />
          <ThemedText variant="footnote" color="secondaryLabel">
            {t("made_with_love_suffix")} SolsticeLeaf
          </ThemedText>
        </View>
      </ScreenContent>
    </>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
  },
  heroIcon: {
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  appMeta: {
    flex: 1,
    gap: 2,
  },
  appName: {
    fontWeight: "700",
  },
  supportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingTop: Spacing.md,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  authorAvatar: {
    width: 52,
    height: 52,
  },
  authorMeta: {
    flex: 1,
    gap: 2,
  },
  authorTitle: {
    fontWeight: "600",
  },
  supportActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  emailButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  githubButton: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.72,
  },
});
