import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { Card } from "@/components/ui/card";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import {
  currentAppVersion,
  downloadApk,
  fetchLatestRelease,
  installApk,
  isNewer,
  type AppRelease,
} from "@/services/app-update";
import { useTheme } from "@/hooks/use-theme";

type Phase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; release: AppRelease }
  | { kind: "downloading"; release: AppRelease; progress: number }
  | { kind: "error"; message: string; release?: AppRelease };

function formatSize(bytes: number | null): string {
  return bytes ? `${(bytes / 1048576).toFixed(1)} MB` : "";
}

/** Material card that checks GitHub Releases and installs the newest APK. */
export function AppUpdateCard() {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const check = useCallback(async (silent: boolean) => {
    setPhase({ kind: "checking" });
    try {
      const release = await fetchLatestRelease();
      setPhase(isNewer(release) ? { kind: "available", release } : { kind: "upToDate" });
    } catch (error) {
      setPhase(
        silent
          ? { kind: "idle" }
          : { kind: "error", message: error instanceof Error ? error.message : String(error) },
      );
    }
  }, []);

  useEffect(() => {
    void check(true);
  }, [check]);

  const install = async (release: AppRelease) => {
    if (!release.apkUrl) {
      void Linking.openURL(release.pageUrl);
      return;
    }
    setPhase({ kind: "downloading", release, progress: 0 });
    try {
      const uri = await downloadApk(release.apkUrl, (progress) =>
        setPhase({ kind: "downloading", release, progress }),
      );
      await installApk(uri);
      setPhase({ kind: "available", release });
    } catch (error) {
      setPhase({
        kind: "error",
        release,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const busy = phase.kind === "checking" || phase.kind === "downloading";
  const release =
    phase.kind === "available" || phase.kind === "downloading" || phase.kind === "error"
      ? phase.release
      : undefined;

  let title = t("update_check");
  let subtitle = `${t("app_version")} ${currentAppVersion()}`;
  let icon: keyof typeof Ionicons.glyphMap = "refresh";
  if (phase.kind === "checking") title = t("update_checking");
  if (phase.kind === "upToDate") {
    title = t("update_up_to_date");
    icon = "checkmark-circle";
  }
  if (phase.kind === "available") {
    title = t("update_available", { version: phase.release.version });
    subtitle = formatSize(phase.release.apkSize) || phase.release.name;
    icon = "arrow-down-circle";
  }
  if (phase.kind === "downloading") {
    title = t("update_downloading");
    subtitle = `${Math.round(phase.progress * 100)}%`;
    icon = "cloud-download";
  }
  if (phase.kind === "error") {
    title = t("update_failed");
    subtitle = phase.message;
    icon = "alert-circle";
  }

  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: colors.tint + "26" }]}>
          <Ionicons name={icon} size={24} color={colors.tint} />
        </View>
        <View style={styles.meta}>
          <ThemedText variant="body" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText variant="footnote" color="secondaryLabel" numberOfLines={2}>
            {subtitle}
          </ThemedText>
        </View>
      </View>

      {phase.kind === "downloading" ? (
        <View style={[styles.track, { backgroundColor: colors.secondaryFill }]}>
          <View
            style={[
              styles.bar,
              { backgroundColor: colors.tint, width: `${Math.round(phase.progress * 100)}%` },
            ]}
          />
        </View>
      ) : null}

      {phase.kind === "available" && phase.release.notes ? (
        <ThemedText
          variant="footnote"
          color="secondaryLabel"
          numberOfLines={6}
          style={styles.notes}
        >
          {phase.release.notes}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        {release ? (
          <Pressable
            style={styles.textButton}
            android_ripple={{ color: colors.quaternaryFill }}
            onPress={() => void Linking.openURL(release.pageUrl)}
            accessibilityRole="button"
          >
            <ThemedText variant="callout" style={{ color: colors.tint }}>
              {t("update_release_page")}
            </ThemedText>
          </Pressable>
        ) : null}
        {phase.kind === "available" || (phase.kind === "error" && phase.release) ? (
          <Pressable
            style={[styles.filled, { backgroundColor: colors.tint }]}
            android_ripple={{ color: "rgba(255,255,255,0.25)" }}
            onPress={() => release && void install(release)}
            accessibilityRole="button"
          >
            <ThemedText variant="callout" color="onTint" style={styles.filledLabel}>
              {t("update_install")}
            </ThemedText>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.filled, { backgroundColor: busy ? colors.quaternaryFill : colors.tint }]}
            android_ripple={{ color: "rgba(255,255,255,0.25)" }}
            disabled={busy}
            onPress={() => void check(false)}
            accessibilityRole="button"
          >
            <ThemedText
              variant="callout"
              color={busy ? "tertiaryLabel" : "onTint"}
              style={styles.filledLabel}
            >
              {t("update_check")}
            </ThemedText>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { flex: 1, gap: 2 },
  title: { fontWeight: "600" },
  track: { height: 4, borderRadius: 2, marginHorizontal: 16, overflow: "hidden" },
  bar: { height: 4, borderRadius: 2 },
  notes: { paddingHorizontal: 16, paddingTop: 12 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    padding: 16,
  },
  textButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, overflow: "hidden" },
  filled: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: "hidden",
  },
  filledLabel: { fontWeight: "600" },
});
