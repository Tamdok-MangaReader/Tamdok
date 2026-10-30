import { Ionicons } from "@expo/vector-icons";
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
import { GlassIconButton } from "@/components/ui/glass-icon-button";
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
  setMangaSlowMode,
} from "@/services/reader-manga-settings";
import { setReaderSlowMode, useReaderSlowMode } from "@/utils/reader-slow-mode";

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
  const { colors, radius } = useTheme();
  const slowMode = useReaderSlowMode();
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

  const handleSlowModeChange = useCallback(
    (value: boolean) => {
      setReaderSlowMode(value);
      void setMangaSlowMode(sourceId, mangaKey, value).catch(() => {
        setReaderSlowMode(!value);
      });
    },
    [mangaKey, sourceId],
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
            backgroundColor: colors.groupedBackground,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <ThemedText variant="title3" style={styles.title}>
            {t("reader_settings_title")}
          </ThemedText>
          <GlassIconButton
            icon="close"
            size={36}
            iconSize={20}
            onPress={onClose}
            accessibilityLabel={t("done")}
          />
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText
            variant="footnote"
            color="secondaryLabel"
            style={styles.sectionLabel}
          >
            {t("reader_manga_section")}
          </ThemedText>
          <Card style={styles.card}>
            <ThemedText variant="subheadline" style={styles.cardTitle}>
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
          <Card style={styles.card}>
            <View style={styles.switchRow}>
              <View
                style={[
                  styles.iconBadge,
                  { backgroundColor: colors.tint, borderRadius: radius.sm },
                ]}
              >
                <Ionicons name="hourglass-outline" size={18} color={colors.onTint} />
              </View>
              <View style={styles.switchText}>
                <ThemedText variant="body">{t("reader_slow_mode")}</ThemedText>
                <ThemedText variant="footnote" color="secondaryLabel">
                  {t("reader_slow_mode_hint")}
                </ThemedText>
              </View>
              <Switch value={slowMode} onValueChange={handleSlowModeChange} />
            </View>
          </Card>

          <ThemedText
            variant="footnote"
            color="secondaryLabel"
            style={styles.sectionLabel}
          >
            {t("reader_controls_section")}
          </ThemedText>
          {mode === "continuous" ? (
            <ThemedText
              variant="footnote"
              color="secondaryLabel"
              style={styles.hint}
            >
              {t("reader_tap_zones_continuous_disabled")}
            </ThemedText>
          ) : (
            <Card style={styles.card}>
              <ThemedText variant="subheadline" style={styles.cardTitle}>
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

          <Pressable onPress={handleOpenGlobalSettings}>
            <Card style={styles.linkCard}>
              <Ionicons name="settings-outline" size={20} color={colors.tint} />
              <ThemedText variant="body" color="tint" style={styles.linkLabel}>
                {t("reader_open_global_settings")}
              </ThemedText>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.tertiaryLabel}
              />
            </Card>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "transparent",
  },
  sheet: {
    maxHeight: "80%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  headerSide: {
    width: 36,
    height: 36,
  },
  title: {
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  content: {
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  sectionLabel: {
    paddingHorizontal: Spacing.xs,
    marginBottom: -Spacing.xs,
    textTransform: "uppercase",
  },
  hint: {
    paddingHorizontal: Spacing.xs,
  },
  card: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardTitle: {
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconBadge: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  switchText: {
    flex: 1,
    gap: 2,
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
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  linkLabel: {
    flex: 1,
  },
});
