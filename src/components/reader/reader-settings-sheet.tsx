import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InlinePillGrid } from "@/components/library/inline-pill-grid";
import { useReader } from "@/components/reader/reader-context";
import { TapZonePreview } from "@/components/reader/tap-zone-preview";
import { Card } from "@/components/ui/card";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useTheme } from "@/hooks/use-theme";
import {
  updateAppSettings,
  type ReadingMode,
  type TapZones,
} from "@/services/app-settings";
import {
  setMangaAutoResolvedMode,
  setMangaReadingMode,
} from "@/services/reader-manga-settings";

const MANGA_READING_MODES: Array<ReadingMode | "default"> = [
  "default",
  "auto",
  "rtl",
  "ltr",
  "vertical",
  "webtoon",
  "continuous",
];

const TAP_ZONES: TapZones[] = [
  "left-right",
  "l-shaped",
  "kindle",
  "edge",
  "auto",
  "disabled",
];

type ReaderSettingsSheetProps = {
  visible: boolean;
  sourceId: string;
  mangaReadingMode: ReadingMode | "default" | null;
  onClose: () => void;
  onMangaReadingModeChange: (mode: ReadingMode | "default") => void;
};

export function ReaderSettingsSheet({
  visible,
  sourceId,
  mangaReadingMode,
  onClose,
  onMangaReadingModeChange,
}: ReaderSettingsSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  const { manga, settings, mode } = useReader();
  const mangaKey = manga.key;
  const selectedMode = mangaReadingMode ?? "default";

  const modeOptions = useMemo(
    () =>
      MANGA_READING_MODES.map((option) => ({
        id: option,
        label: t(`reader_mode_${option}`),
      })),
    [],
  );
  const tapZoneOptions = useMemo(
    () =>
      TAP_ZONES.map((zone) => ({
        id: zone,
        label: t(`reader_tap_zones_${zone.replace("-", "_")}`),
      })),
    [],
  );

  const handleSelectMode = useCallback(
    (id: string) => {
      const next = id as ReadingMode | "default";
      const previous = mangaReadingMode ?? "default";
      if (next === previous) return;
      onMangaReadingModeChange(next);
      const persist = async () => {
        await setMangaReadingMode(sourceId, mangaKey, next);
        if (next !== "default" && next !== "auto") {
          await setMangaAutoResolvedMode(sourceId, mangaKey, next);
        }
      };
      persist().catch(() => onMangaReadingModeChange(previous));
    },
    [mangaKey, mangaReadingMode, onMangaReadingModeChange, sourceId],
  );

  const handleOpenGlobalSettings = useCallback(() => {
    onClose();
    router.navigate("/settings/reader");
  }, [onClose, router]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + Spacing.lg,
            backgroundColor: colors.secondarySystemBackground,
          },
        ]}
      >
        <ThemedText variant="headline" style={styles.title}>
          {t("reader_settings_title")}
        </ThemedText>
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.card}>
            <ThemedText variant="subheadline">
              {t("reader_manga_reading_mode")}
            </ThemedText>
            <ThemedText variant="footnote" color="secondaryLabel">
              {t("reader_manga_reading_mode_hint")}
            </ThemedText>
            <InlinePillGrid
              options={modeOptions}
              selectedId={selectedMode}
              preserveOrder
              onSelect={handleSelectMode}
            />
          </Card>
          {mode === "continuous" ? (
            <ThemedText variant="footnote" color="secondaryLabel">
              {t("reader_tap_zones_continuous_disabled")}
            </ThemedText>
          ) : (
            <Card style={styles.card}>
              <ThemedText variant="subheadline">
                {t("reader_tap_zones")}
              </ThemedText>
              <InlinePillGrid
                options={tapZoneOptions}
                selectedId={settings.tapZones}
                preserveOrder
                onSelect={(id) => {
                  void updateAppSettings({
                    reader: { ...settings, tapZones: id as TapZones },
                  });
                }}
              />
              <TapZonePreview settings={settings} />
              <View style={styles.invertRow}>
                <ThemedText variant="body" style={styles.invertLabel}>
                  {t("reader_invert_tap_zones")}
                </ThemedText>
                <Switch
                  value={settings.invertTapZones}
                  onValueChange={(value) => {
                    void updateAppSettings({
                      reader: { ...settings, invertTapZones: value },
                    });
                  }}
                />
              </View>
            </Card>
          )}
          <Pressable
            style={[styles.linkRow, { backgroundColor: colors.tertiaryFill }]}
            onPress={handleOpenGlobalSettings}
          >
            <ThemedText variant="body" color="tint">
              {t("reader_open_global_settings")}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    maxHeight: "75%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  title: {
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  content: {
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  card: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  invertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  invertLabel: {
    flex: 1,
  },
  linkRow: {
    borderRadius: 12,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
});
