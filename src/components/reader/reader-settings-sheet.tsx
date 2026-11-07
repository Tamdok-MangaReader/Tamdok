import Animated, { FadeIn } from "react-native-reanimated";
import { Modal } from "@/hooks/use-duo-layout";
import { MODAL_HEADER_HEIGHT, ModalHeader } from "@/components/ui/modal-header";
import { SwipeDismissSheet } from "@/components/ui/swipe-dismiss-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MenuPickerRow } from "@/components/ui/menu-picker-row";
import { SectionFooter } from "@/components/ui/section-footer";
import { SectionLabel } from "@/components/ui/section-label";
import { OptionSegmentedControl } from "@/components/ui/option-segmented-control";
import { useReader } from "@/components/reader/reader-context";
import { areReaderTapZonesEnabled } from "@/utils/reader-tap-zones";
import { TapZonePreview } from "@/components/reader/tap-zone-preview";
import { Card, CardSeparator } from "@/components/ui/card";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useTheme } from "@/hooks/use-theme";
import {
  updateAppSettings,
  type PagedPageLayout,
  type ReaderBackgroundColor,
  type ReaderOrientation,
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
  "auto",
  "default",
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

const BACKGROUND_COLORS: ReaderBackgroundColor[] = ["system", "white", "black"];
const ORIENTATIONS: ReaderOrientation[] = ["device", "portrait", "landscape"];
const PAGE_LAYOUTS: PagedPageLayout[] = ["auto", "single", "double"];

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

  const backgroundOptions = useMemo(
    () =>
      BACKGROUND_COLORS.map((id) => ({
        id,
        label: t(`reader_background_${id}`),
      })),
    [],
  );
  const orientationOptions = useMemo(
    () =>
      ORIENTATIONS.map((id) => ({ id, label: t(`reader_orientation_${id}`) })),
    [],
  );
  const pageLayoutOptions = useMemo(
    () =>
      PAGE_LAYOUTS.map((id) => ({ id, label: t(`reader_page_layout_${id}`) })),
    [],
  );
  const patchReader = useCallback(
    (patch: Partial<typeof settings>) => {
      void updateAppSettings({ reader: { ...settings, ...patch } });
    },
    [settings],
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
      animationType="none"
      transparent
      onRequestClose={onClose}
    >
      <Animated.View entering={FadeIn.duration(250)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <SwipeDismissSheet
        onClose={onClose}
        style={[styles.sheet, { backgroundColor: colors.groupedBackground }]}
      >
        <ModalHeader
          title={t("reader_settings_title")}
          closeLabel={t("done")}
          onClose={onClose}
        />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: MODAL_HEADER_HEIGHT + Spacing.md,
              paddingBottom: insets.bottom + Spacing.lg,
            },
          ]}
          scrollIndicatorInsets={{ top: MODAL_HEADER_HEIGHT }}
          showsVerticalScrollIndicator={false}
        >
          <SectionLabel isFirst>{t("reader_manga_section")}</SectionLabel>
          <Card>
            <MenuPickerRow
              label={t("reader_manga_reading_mode")}
              options={modeOptions}
              selectedId={selectedMode}
              onSelect={handleSelectMode}
              isFirst
              isLast
            />
          </Card>
          <SectionFooter spaced>{t("reader_manga_reading_mode_hint")}</SectionFooter>
          <Card>
            <SwitchRow
              label={t("reader_slow_mode")}
              value={slowMode}
              onChange={handleSlowModeChange}
            />
          </Card>
          <SectionFooter>{t("reader_slow_mode_hint")}</SectionFooter>

          {areReaderTapZonesEnabled(mode) ? (
            <>
              <SectionLabel>{t("reader_controls_section")}</SectionLabel>
              <Card>
                <MenuPickerRow
                  label={t("reader_tap_zones")}
                  options={tapZoneOptions}
                  selectedId={settings.tapZones}
                  onSelect={(id) => patchReader({ tapZones: id as TapZones })}
                  isFirst
                />
                <CardSeparator />
                <View style={styles.preview}>
                  <TapZonePreview settings={settings} />
                </View>
              </Card>
              <Card>
                <SwitchRow
                  label={t("reader_invert_tap_zones")}
                  value={settings.invertTapZones}
                  onChange={(value) => patchReader({ invertTapZones: value })}
                />
              </Card>
            </>
          ) : null}

          <SectionLabel>{t("reader_background_color")}</SectionLabel>
          <OptionSegmentedControl
            options={backgroundOptions}
            selectedId={settings.backgroundColor}
            onSelect={(id) =>
              patchReader({ backgroundColor: id as ReaderBackgroundColor })
            }
          />
          <SectionLabel>{t("reader_orientation")}</SectionLabel>
          <OptionSegmentedControl
            options={orientationOptions}
            selectedId={settings.orientation}
            onSelect={(id) =>
              patchReader({ orientation: id as ReaderOrientation })
            }
          />
          {mode !== "continuous" && mode !== "webtoon" ? (
            <>
              <SectionLabel>{t("reader_page_layout")}</SectionLabel>
              <OptionSegmentedControl
                options={pageLayoutOptions}
                selectedId={settings.pagedPageLayout}
                onSelect={(id) =>
                  patchReader({ pagedPageLayout: id as PagedPageLayout })
                }
              />
            </>
          ) : null}

          <SectionLabel>{t("reader_display_section")}</SectionLabel>
          <Card>
            <SwitchRow
              label={t("reader_crop_borders")}
              value={settings.cropBorders}
              onChange={(value) => patchReader({ cropBorders: value })}
            />
            <CardSeparator />
            <SwitchRow
              label={t("reader_split_wide_images")}
              value={settings.splitWideImages}
              onChange={(value) => patchReader({ splitWideImages: value })}
            />
            <CardSeparator />
            <SwitchRow
              label={t("reader_animate_transitions")}
              value={settings.animatePageTransitions}
              onChange={(value) => patchReader({ animatePageTransitions: value })}
            />
            {mode !== "continuous" &&
            mode !== "webtoon" &&
            settings.pagedPageLayout !== "single" ? (
              <>
                <CardSeparator />
                <SwitchRow
                  label={t("reader_page_offset")}
                  value={settings.pagedPageOffset}
                  onChange={(value) => patchReader({ pagedPageOffset: value })}
                />
              </>
            ) : null}
            <CardSeparator />
            <SwitchRow
              label={t("reader_pillarbox")}
              value={settings.pillarbox}
              onChange={(value) => patchReader({ pillarbox: value })}
            />
            <CardSeparator />
            <SwitchRow
              label={t("reader_double_tap_zoom")}
              value={!settings.disableDoubleTap}
              onChange={(value) => patchReader({ disableDoubleTap: !value })}
            />
            {Platform.OS === "ios" ? (
              <>
                <CardSeparator />
                <SwitchRow
                  label={t("reader_live_text")}
                  value={settings.liveText}
                  onChange={(value) => patchReader({ liveText: value })}
                />
              </>
            ) : null}
          </Card>

          <View style={styles.linkWrap}>
            <Card>
              <Pressable
                onPress={handleOpenGlobalSettings}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.linkRow,
                  pressed && { backgroundColor: colors.quaternaryFill },
                ]}
              >
                <ThemedText variant="body" style={styles.linkLabel}>
                  {t("reader_open_global_settings")}
                </ThemedText>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.tertiaryLabel}
                />
              </Pressable>
            </Card>
          </View>
        </ScrollView>
      </SwipeDismissSheet>
    </Modal>
  );
}

function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <ThemedText variant="body" style={styles.switchLabel}>
        {label}
      </ThemedText>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "transparent",
  },
  sheet: {
    maxHeight: "85%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: 52,
  },
  switchLabel: {
    flex: 1,
  },
  preview: {
    padding: Spacing.lg,
  },
  linkWrap: {
    marginTop: Spacing.lg,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight: 48,
  },
  linkLabel: {
    flex: 1,
  },
});
