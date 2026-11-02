import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import PagerView from "react-native-pager-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ReaderPageSlider } from "@/components/reader/reader-page-slider";
import { GlassSegmentedControl } from "@/components/ui/glass-segmented-control";
import { SwipeDismissSheet } from "@/components/ui/swipe-dismiss-sheet";
import { MODAL_HEADER_HEIGHT, ModalHeader } from "@/components/ui/modal-header";
import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import { Modal, useWindowDimensions } from "@/hooks/use-duo-layout";
import { useTheme } from "@/hooks/use-theme";
import {
  DEFAULT_LIBRARY_FILTERS,
  DEFAULT_SETTINGS,
  getAppSettings,
  libraryDisplayColumns,
  updateAppSettings,
  type CoverDisplaySettings,
  type LibraryDisplayMode,
  type LibraryDisplaySettings,
  type LibraryFilters,
  type LibrarySortMode,
} from "@/services/app-settings";
import { hasActiveLibraryFilters, LIBRARY_SORT_MODES } from "@/services/library";
import { IMAGE_CACHE_POLICY } from "@/utils/image-memory";
import { subscribeAppSettings } from "@/utils/app-settings-events";

export type LibrarySourceOption = {
  id: string;
  name: string;
  count: number;
  iconUri?: string;
};

type LibraryOptionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  sources: LibrarySourceOption[];
};

const STATUS_IDS = [
  "ongoing",
  "completed",
  "hiatus",
  "cancelled",
  "unknown",
] as const;
const DISPLAY_MODES: LibraryDisplayMode[] = ["grid", "list", "descriptiveList"];
const MAX_COLUMNS = 6;

/**
 * Plain pill without an interactive glass wrapper: nested interactive glass can swallow the first
 * tap on iOS, which made multi-select pills need two presses.
 */
function Pill({
  label,
  selected,
  onPress,
  iconUri,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  iconUri?: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.pill,
        {
          borderRadius: radius.pill,
          backgroundColor: selected ? colors.tint : colors.tertiaryFill,
        },
        iconUri ? styles.pillWithIcon : null,
      ]}
    >
      {iconUri ? (
        <Image
          source={{ uri: iconUri }}
          style={styles.pillIcon}
          contentFit="cover"
          cachePolicy={IMAGE_CACHE_POLICY}
        />
      ) : null}
      <ThemedText
        variant="subheadline"
        color={selected ? "onTint" : "label"}
        numberOfLines={1}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText variant="footnote" color="secondaryLabel">
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

function SwitchLine({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.switchLine}>
      <ThemedText variant="body" style={styles.switchLabel}>
        {label}
      </ThemedText>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export function LibraryOptionsSheet({
  visible,
  onClose,
  sources,
}: LibraryOptionsSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const pagerRef = useRef<PagerView>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [display, setDisplay] = useState<LibraryDisplaySettings | null>(null);
  const [cover, setCover] = useState<CoverDisplaySettings | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const load = useCallback(async () => {
    const settings = await getAppSettings();
    setDisplay(settings.libraryDisplay);
    setCover(settings.coverDisplay);
  }, []);

  useEffect(() => {
    if (!visible) return;
    void load();
    return subscribeAppSettings(() => void load());
  }, [visible, load]);

  // Local state is updated first so controls react instantly; the stored value follows.
  const patchDisplay = useCallback((patch: Partial<LibraryDisplaySettings>) => {
    setDisplay((prev) => (prev ? { ...prev, ...patch } : prev));
    void updateAppSettings({ libraryDisplay: patch });
  }, []);

  const patchCover = useCallback((patch: Partial<CoverDisplaySettings>) => {
    setCover((prev) => (prev ? { ...prev, ...patch } : prev));
    void updateAppSettings({ coverDisplay: patch });
  }, []);

  const patchFilters = useCallback(
    (patch: Partial<LibraryFilters>) => {
      if (!display) return;
      patchDisplay({ filters: { ...display.filters, ...patch } });
    },
    [display, patchDisplay],
  );

  const resetSort = useCallback(() => {
    const d = DEFAULT_SETTINGS.libraryDisplay;
    patchDisplay({ sortMode: d.sortMode, sortReversed: d.sortReversed });
  }, [patchDisplay]);

  const resetDisplay = useCallback(() => {
    const { libraryDisplay: d, coverDisplay: c } = DEFAULT_SETTINGS;
    patchDisplay({
      displayMode: d.displayMode,
      gridSize: d.gridSize,
      gridColumns: libraryDisplayColumns(d),
      showUnreadBadges: d.showUnreadBadges,
      showDownloadedBadges: d.showDownloadedBadges,
      showCoverTitles: d.showCoverTitles,
      showCategoryCountBadges: d.showCategoryCountBadges,
      hideEmptyCategoryCountBadges: d.hideEmptyCategoryCountBadges,
      hideEmptyCategories: d.hideEmptyCategories,
    });
    patchCover({
      showFinishedBadge: c.showFinishedBadge,
      showStatusBadge: c.showStatusBadge,
    });
  }, [patchDisplay, patchCover]);

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  const handleSegment = useCallback((index: number) => {
    setPageIndex(index);
    pagerRef.current?.setPage(index);
  }, []);

  const segmentLabels = [
    t("library_options_filter"),
    t("library_options_sort"),
    t("library_options_display"),
  ];

  const pageContent = {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: insets.bottom + Spacing.xxl,
    gap: Spacing.xl,
  };

  const filters = display?.filters ?? DEFAULT_LIBRARY_FILTERS;
  const selectedSourceCount = filters.sourceIds.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SwipeDismissSheet
        onClose={onClose}
        style={[
          styles.sheet,
          {
            height: Math.round(windowHeight * 0.8),
            backgroundColor: colors.secondarySystemBackground,
          },
        ]}
      >
        <ModalHeader
          title={t("library_options")}
          closeLabel={t("done")}
          onClose={onClose}
        />
        <View style={{ paddingTop: MODAL_HEADER_HEIGHT + Spacing.sm }}>
          <View style={styles.segmentWrap}>
            <GlassSegmentedControl
              values={segmentLabels}
              selectedIndex={pageIndex}
              onChange={handleSegment}
            />
          </View>
        </View>

        {display && cover ? (
          <PagerView
            ref={pagerRef}
            style={styles.pager}
            initialPage={0}
            onPageSelected={(event) => setPageIndex(event.nativeEvent.position)}
          >
            {/* Filter */}
            <ScrollView
              key="filter"
              contentContainerStyle={pageContent}
              keyboardShouldPersistTaps="handled"
            >
              <Section title={t("library_filter_status")}>
                <View style={styles.pillWrap}>
                  {STATUS_IDS.map((id) => (
                    <Pill
                      key={id}
                      label={t(`library_status_${id}`)}
                      selected={filters.statuses.includes(id)}
                      onPress={() =>
                        patchFilters({ statuses: toggleIn(filters.statuses, id) })
                      }
                    />
                  ))}
                </View>
              </Section>

              <Section title={t("library_filter_reading")}>
                <View style={styles.pillWrap}>
                  {(["all", "unread", "read", "finished"] as const).map((id) => (
                    <Pill
                      key={id}
                      label={t(`library_filter_${id}`)}
                      selected={filters.readState === id}
                      onPress={() => patchFilters({ readState: id })}
                    />
                  ))}
                </View>
              </Section>

              <Section title={t("library_filter_downloads")}>
                <View style={styles.pillWrap}>
                  {(
                    [
                      ["all", t("library_filter_all")],
                      ["downloaded", t("library_filter_downloaded")],
                      ["notDownloaded", t("library_filter_not_downloaded")],
                    ] as const
                  ).map(([id, label]) => (
                    <Pill
                      key={id}
                      label={label}
                      selected={filters.downloaded === id}
                      onPress={() => patchFilters({ downloaded: id })}
                    />
                  ))}
                </View>
              </Section>

              <Section title={t("library_filter_sources")}>
                <Pressable
                  onPress={() => setSourcesOpen((open) => !open)}
                  accessibilityRole="button"
                  style={[
                    styles.sourcesButton,
                    { backgroundColor: colors.tertiaryFill },
                  ]}
                >
                  <ThemedText variant="body" style={styles.switchLabel}>
                    {selectedSourceCount === 0
                      ? t("library_filter_sources_all")
                      : t("library_filter_sources_count", {
                          count: String(selectedSourceCount),
                        })}
                  </ThemedText>
                  <SFSymbolIcon
                    name={sourcesOpen ? "chevron.up" : "chevron.down"}
                    fallback={sourcesOpen ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.secondaryLabel}
                  />
                </Pressable>
                {sourcesOpen ? (
                  <View style={styles.pillWrap}>
                    {sources.map((source) => (
                      <Pill
                        key={source.id}
                        label={`${source.name} · ${source.count}`}
                        iconUri={source.iconUri}
                        selected={filters.sourceIds.includes(source.id)}
                        onPress={() =>
                          patchFilters({
                            sourceIds: toggleIn(filters.sourceIds, source.id),
                          })
                        }
                      />
                    ))}
                  </View>
                ) : null}
              </Section>

              {hasActiveLibraryFilters(filters) ? (
                <Pressable
                  onPress={() => {
                    void Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Success,
                    );
                    patchFilters({ ...DEFAULT_LIBRARY_FILTERS });
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.resetButton,
                    pressed && { backgroundColor: colors.tertiaryFill },
                  ]}
                >
                  <ThemedText variant="body" color="tint">
                    {t("library_filter_reset")}
                  </ThemedText>
                </Pressable>
              ) : null}
            </ScrollView>

            {/* Sort */}
            <ScrollView key="sort" contentContainerStyle={pageContent}>
              <Section title={t("library_options_sort")}>
                <View style={[styles.group, { backgroundColor: colors.tertiaryFill }]}>
                  {LIBRARY_SORT_MODES.map((mode: LibrarySortMode, index) => (
                    <Pressable
                      key={mode}
                      onPress={() => patchDisplay({ sortMode: mode })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: display.sortMode === mode }}
                      style={[
                        styles.optionRow,
                        index > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: colors.separator,
                        },
                      ]}
                    >
                      <ThemedText variant="body" style={styles.switchLabel}>
                        {t(`library_sort_${mode}`)}
                      </ThemedText>
                      {display.sortMode === mode ? (
                        <SFSymbolIcon
                          name="checkmark"
                          fallback="checkmark"
                          size={18}
                          color={colors.tint}
                        />
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </Section>
              <View style={[styles.group, { backgroundColor: colors.tertiaryFill }]}>
                <SwitchLine
                  label={t("library_sort_reverse")}
                  value={display.sortReversed}
                  onChange={(value) => patchDisplay({ sortReversed: value })}
                />
              </View>
              <Pressable
                onPress={() => {
                  void Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                  resetSort();
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                    styles.resetButton,
                    pressed && { backgroundColor: colors.tertiaryFill },
                  ]}
              >
                <ThemedText variant="body" color="tint">
                  {t("library_reset_defaults")}
                </ThemedText>
              </Pressable>
            </ScrollView>

            {/* Display */}
            <ScrollView key="display" contentContainerStyle={pageContent}>
              <Section title={t("library_display_mode")}>
                <View style={styles.pillWrap}>
                  {DISPLAY_MODES.map((mode) => (
                    <Pill
                      key={mode}
                      label={t(
                        mode === "grid"
                          ? "library_display_grid"
                          : mode === "list"
                            ? "library_display_list"
                            : "library_display_descriptive",
                      )}
                      selected={display.displayMode === mode}
                      onPress={() => patchDisplay({ displayMode: mode })}
                    />
                  ))}
                </View>
              </Section>

              {display.displayMode === "grid" ? (
                <Section title={t("library_display_columns")}>
                  <View style={styles.sliderRow}>
                    <ReaderPageSlider
              untinted
                      currentPage={libraryDisplayColumns(display) - 1}
                      totalPages={MAX_COLUMNS}
                      accentColor={colors.tint}
                      labelColor={colors.label}
                      onSeek={(page) => patchDisplay({ gridColumns: page + 1 })}
                    />
                  </View>
                </Section>
              ) : null}

              <Section title={t("library_display_badges")}>
                <View style={[styles.group, { backgroundColor: colors.tertiaryFill }]}>
                  <SwitchLine
                    label={t("library_show_unread_badges")}
                    value={display.showUnreadBadges}
                    onChange={(value) => patchDisplay({ showUnreadBadges: value })}
                  />
                  <SwitchLine
                    label={t("library_show_downloaded_badges")}
                    value={display.showDownloadedBadges}
                    onChange={(value) =>
                      patchDisplay({ showDownloadedBadges: value })
                    }
                  />
                  <SwitchLine
                    label={t("appearance_show_finished")}
                    value={cover.showFinishedBadge}
                    onChange={(value) => patchCover({ showFinishedBadge: value })}
                  />
                  <SwitchLine
                    label={t("appearance_show_status")}
                    value={cover.showStatusBadge}
                    onChange={(value) => patchCover({ showStatusBadge: value })}
                  />
                  {display.displayMode === "grid" ? (
                    <SwitchLine
                      label={t("library_show_cover_titles")}
                      value={display.showCoverTitles}
                      onChange={(value) =>
                        patchDisplay({ showCoverTitles: value })
                      }
                    />
                  ) : null}
                </View>
              </Section>

              <Section title={t("library_display_categories")}>
                <View style={[styles.group, { backgroundColor: colors.tertiaryFill }]}>
                  <SwitchLine
                    label={t("library_show_category_count_badges")}
                    value={display.showCategoryCountBadges}
                    onChange={(value) =>
                      patchDisplay({ showCategoryCountBadges: value })
                    }
                  />
                  {display.showCategoryCountBadges ? (
                    <SwitchLine
                      label={t("library_hide_empty_category_count_badges")}
                      value={display.hideEmptyCategoryCountBadges}
                      onChange={(value) =>
                        patchDisplay({ hideEmptyCategoryCountBadges: value })
                      }
                    />
                  ) : null}
                  <SwitchLine
                    label={t("library_hide_empty_categories")}
                    value={display.hideEmptyCategories}
                    onChange={(value) =>
                      patchDisplay({ hideEmptyCategories: value })
                    }
                  />
                </View>
              </Section>
              <Pressable
                onPress={() => {
                  void Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                  resetDisplay();
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                    styles.resetButton,
                    pressed && { backgroundColor: colors.tertiaryFill },
                  ]}
              >
                <ThemedText variant="body" color="tint">
                  {t("library_reset_defaults")}
                </ThemedText>
              </Pressable>
            </ScrollView>
          </PagerView>
        ) : null}
      </SwipeDismissSheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  segmentWrap: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  sliderRow: {
    flexDirection: "row",
  },
  pager: {
    flex: 1,
  },
  section: {
    gap: Spacing.sm,
  },
  pillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  pillWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  pillIcon: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  group: {
    borderRadius: 14,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 48,
  },
  switchLine: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: 48,
  },
  switchLabel: {
    flex: 1,
  },
  sourcesButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 48,
  },
  resetButton: {
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: Spacing.md,
  },
});
