import { Modal } from "@/hooks/use-duo-layout";
import { MODAL_HEADER_HEIGHT, ModalHeader } from "@/components/ui/modal-header";
import { Ionicons } from "@expo/vector-icons";
import {
  Fragment,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  useWindowDimensions as useRNWindowDimensions,
} from "react-native";
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
} from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { NativeFilterMenu, isNativeMenuFilter } from "@/components/sources/native-filter-menu";
import { Card, CardSeparator } from "@/components/ui/card";
import { MenuPickerRow } from "@/components/ui/menu-picker-row";
import { SwipeDismissSheet } from "@/components/ui/swipe-dismiss-sheet";
import { OptionSegmentedControl } from "@/components/ui/option-segmented-control";
import { GlassSurface } from "@/components/ui/glass-surface";
import { SectionLabel } from "@/components/ui/section-label";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useTheme } from "@/hooks/use-theme";
import {
  defaultFilterValues,
  filterLabel,
  isInlineFilter,
  updateFilterValue,
} from "@/parsers/shared/filters";
import type { FilterDefinition, FilterValue } from "@/parsers/shared/types";

type MangaSearchFilterBarProps = {
  definitions: FilterDefinition[];
  values: FilterValue[];
  onChange: (values: FilterValue[]) => void;
  /** When set, the full filter modal is owned by the parent and this opens it. */
  onOpenFilters?: () => void;
  hideFiltersButton?: boolean;
};

const EMPTY_IDS: string[] = [];
const OPTION_PAGE_SIZE = 80;
/** In the inline dropdown only this many leading options get a glass effect (each GlassView is a native blur); the modal and the rest stay flat. */
const GLASS_OPTION_LIMIT = 36;
const INLINE_TAGS_START = 24;
const INLINE_TAGS_STEP = 12;
const INLINE_TAGS_MAX = 120;
/** Space kept free below the dropdown for the tab bar. */
const INLINE_TAGS_BOTTOM_RESERVE = 110;

type MultiSelectDefinition = Extract<FilterDefinition, { type: "multiSelect" }>;
type MultiSelectOption = MultiSelectDefinition["options"][number];

function getMultiSelectState(
  values: FilterValue[],
  definition: MultiSelectDefinition,
) {
  const current = values.find(
    (value): value is Extract<FilterValue, { type: "multiSelect" }> =>
      value.id === definition.id && value.type === "multiSelect",
  );
  return {
    included: current?.included ?? EMPTY_IDS,
    excluded: current?.excluded ?? EMPTY_IDS,
    matchAll: current?.matchAll ?? false,
  };
}

function sameFilterProps<
  P extends { definition: { id: string }; values: FilterValue[] },
>(previous: P, next: P): boolean {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<
    keyof P
  >;
  for (const key of keys) {
    if (key === "values") continue;
    if (previous[key] !== next[key]) return false;
  }
  const id = previous.definition.id;
  return (
    previous.values.find((value) => value.id === id) ===
    next.values.find((value) => value.id === id)
  );
}

function hasDedicatedMatchMode(
  definitions: FilterDefinition[],
  field: "genres" | "tags",
): boolean {
  const id = field === "genres" ? "genres_match_mode" : "tags_match_mode";
  return definitions.some((definition) => definition.id === id);
}

function multiSelectVariant(
  definition: Extract<FilterDefinition, { type: "multiSelect" }>,
): "checkbox" | "tags" | "pills" {
  if (definition.id === "genres" || definition.id === "tags") return "tags";
  if (definition.usesTagStyle) return "pills";
  if (
    definition.id === "status" ||
    definition.id === "type" ||
    definition.id === "rating"
  )
    return "pills";
  return "checkbox";
}

function shouldShowMatchMode(
  definition: Extract<FilterDefinition, { type: "multiSelect" }>,
  definitions: FilterDefinition[],
) {
  if (definition.id === "genres")
    return !hasDedicatedMatchMode(definitions, "genres");
  if (definition.id === "tags")
    return !hasDedicatedMatchMode(definitions, "tags");
  return false;
}

export function MangaSearchFilterBar({
  definitions,
  values,
  onChange,
  onOpenFilters,
  hideFiltersButton = false,
}: MangaSearchFilterBarProps) {
  const { colors, isDark } = useTheme();
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const inlineDefinitions = useMemo(
    () => definitions.filter(isInlineFilter),
    [definitions],
  );

  if (definitions.length === 0) return null;

  const openDefinition =
    inlineDefinitions.find((definition) => definition.id === openFilterId) ??
    null;

  const toggleFilter = (definitionId: string) => {
    setOpenFilterId((current) =>
      current === definitionId ? null : definitionId,
    );
  };

  const applyValue = (next: FilterValue) => {
    onChange(updateFilterValue(values, next));
  };

  const openModal = () => {
    setOpenFilterId(null);
    if (onOpenFilters) onOpenFilters();
    else setModalOpen(true);
  };

  return (
    <>
      <View style={styles.bar}>
        {openDefinition ? (
          <View
            style={[
              styles.dim,
              { backgroundColor: "transparent" },
            ]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setOpenFilterId(null)}
              accessibilityRole="button"
              accessibilityLabel={t("cancel")}
            />
          </View>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.row}
          keyboardShouldPersistTaps="handled"
        >
          {hideFiltersButton ? null : (
            <GlassSurface glassStyle="regular" borderRadius={999} style={styles.iconChip}>
              <Pressable
                style={styles.iconChipPressable}
                onPress={openModal}
                accessibilityRole="button"
                accessibilityLabel={t("source_search_filters")}
              >
                <Ionicons
                  name="options-outline"
                  size={20}
                  color={colors.label}
                />
              </Pressable>
            </GlassSurface>
          )}

          {inlineDefinitions.map((definition) => {
            const isOpen = openFilterId === definition.id;
            const label = filterLabel(definition, values);

            if (Platform.OS === "ios" && isNativeMenuFilter(definition)) {
              return (
                <NativeFilterMenu
                  key={definition.id}
                  definition={definition}
                  values={values}
                  label={label}
                  onApply={applyValue}
                />
              );
            }

            return (
              <FilterChip
                key={definition.id}
                label={label}
                active={isOpen}
                onPress={() => toggleFilter(definition.id)}
              />
            );
          })}
        </ScrollView>

        {openDefinition ? (
          <FilterDropdown
            definitions={definitions}
            definition={openDefinition}
            values={values}
            onApply={applyValue}
            onClose={() => setOpenFilterId(null)}
          />
        ) : null}
      </View>

      {onOpenFilters ? null : (
        <MangaFilterModal
          visible={modalOpen}
          definitions={definitions}
          values={values}
          onChange={onChange}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();

  if (active) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={[
          styles.chipActive,
          { borderRadius: radius.pill, backgroundColor: colors.tint },
        ]}
      >
        <ThemedText variant="callout" color="onTint" numberOfLines={1}>
          {label}
        </ThemedText>
        <Ionicons name="chevron-down" size={15} color={colors.onTint} />
      </Pressable>
    );
  }

  return (
    <GlassSurface
      borderRadius={radius.pill}
      style={styles.chip}
      glassStyle="regular"
    >
      <Pressable
        style={styles.chipPressable}
        onPress={onPress}
        accessibilityRole="button"
      >
        <ThemedText variant="callout" numberOfLines={1}>
          {label}
        </ThemedText>
        <Ionicons name="chevron-down" size={15} color={colors.tertiaryLabel} />
      </Pressable>
    </GlassSurface>
  );
}

function FilterDropdown({
  definitions,
  definition,
  values,
  onApply,
}: {
  definitions: FilterDefinition[];
  definition: FilterDefinition;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  onClose: () => void;
}) {
  let content: React.ReactNode = null;
  switch (definition.type) {
    case "sort":
      content = <SortOptions definition={definition} values={values} onApply={onApply} inline />;
      break;
    case "multiSelect":
      content = (
        <MultiSelectOptions
          definition={definition}
          values={values}
          onApply={onApply}
          variant={multiSelectVariant(definition)}
          showMatchMode={shouldShowMatchMode(definition, definitions)}
        />
      );
      break;
    case "select":
      content = <SelectOptions definition={definition} values={values} onApply={onApply} inline />;
      break;
    case "text":
      content = <TextOptions definition={definition} values={values} onApply={onApply} />;
      break;
    case "check":
      content = <CheckOptions definition={definition} values={values} onApply={onApply} />;
      break;
    case "range":
      content = <RangeOptions definition={definition} values={values} onApply={onApply} />;
      break;
    default:
      return null;
  }
  return <DropdownPanel>{content}</DropdownPanel>;
}

/** Floating card under the chip row: rounded surface with a shadow, scrolls when the options are long. */
function DropdownPanel({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();
  const { height } = useRNWindowDimensions();
  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      style={[
        styles.panel,
        { maxHeight: height * 0.5, shadowOpacity: isDark ? 0.5 : 0.18 },
      ]}
    >
      <GlassSurface glassStyle="regular" borderRadius={20}>
        <ScrollView
          style={[styles.panelScroll, { maxHeight: height * 0.5 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {children}
        </ScrollView>
      </GlassSurface>
    </Animated.View>
  );
}

export function MangaFilterModal({
  visible,
  definitions,
  values,
  onChange,
  onClose,
}: {
  visible: boolean;
  definitions: FilterDefinition[];
  values: FilterValue[];
  onChange: (values: FilterValue[]) => void;
  onClose: () => void;
}) {
  const { colors, radius } = useTheme();
  const { height: windowHeight } = useRNWindowDimensions();
  const [draft, setDraft] = useState(values);
  const [genreQuery, setGenreQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailDefinition = useMemo(
    () =>
      definitions.find(
        (definition): definition is MultiSelectDefinition =>
          definition.id === detailId && definition.type === "multiSelect",
      ) ?? null,
    [definitions, detailId],
  );

  useEffect(() => {
    if (visible) {
      setDetailId(null);
      setDraft(values);
      setGenreQuery("");
      setTagQuery("");
    }
  }, [visible, values]);

  const applyDraft = useCallback((next: FilterValue) => {
    setDraft((current) => updateFilterValue(current, next));
  }, []);

  const commitDraft = () => {
    onChange(draft);
    onClose();
  };

  const resetDraft = () => {
    setDraft(defaultFilterValues(definitions));
    setGenreQuery("");
    setTagQuery("");
  };

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
      <KeyboardAvoidingView
        behavior="padding"
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
        <SwipeDismissSheet
          onClose={onClose}
          style={[
            styles.sheet,
            { backgroundColor: colors.systemBackground },
            // The genre/tag screen is a long list: give it a stable, tall sheet instead of resizing per search result.
            detailDefinition
              ? { height: Math.round(windowHeight * 0.85) }
              : { maxHeight: Math.round(windowHeight * 0.9) },
          ]}
        >
          <ModalHeader
            title={detailDefinition ? detailDefinition.title : t("source_search_filters")}
            closeLabel={detailDefinition ? t("back") : t("cancel")}
            onClose={detailDefinition ? () => setDetailId(null) : onClose}
            actionLabel={
              detailDefinition ? t("done") : t("source_search_filters_apply")
            }
            onAction={detailDefinition ? () => setDetailId(null) : commitDraft}
          />

          {detailDefinition ? (
            <SelectedBar
              definition={detailDefinition}
              values={draft}
              showMatchMode={shouldShowMatchMode(detailDefinition, definitions)}
              onApply={applyDraft}
            />
          ) : null}

          <KeyboardAwareScrollView
            style={detailDefinition ? styles.modalScrollFill : styles.modalScrollFit}
            contentContainerStyle={[
              styles.modalContent,
              {
                paddingTop:
                  MODAL_HEADER_HEIGHT +
                  Spacing.md +
                  (detailDefinition ? SELECTED_BAR_HEIGHT : 0),
                paddingBottom: Spacing.xxxl,
              },
            ]}
            scrollIndicatorInsets={{
              top: MODAL_HEADER_HEIGHT + (detailDefinition ? SELECTED_BAR_HEIGHT : 0),
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bottomOffset={Spacing.lg}
          >
            {detailDefinition ? (
              <MultiSelectOptions
                definition={detailDefinition}
                values={draft}
                onApply={applyDraft}
                query={detailDefinition.id === "tags" ? tagQuery : genreQuery}
                onQueryChange={
                  detailDefinition.id === "tags" ? setTagQuery : setGenreQuery
                }
                variant="list"
                showMatchMode={shouldShowMatchMode(detailDefinition, definitions)}
              />
            ) : (
              <>
            {definitions.map((definition, index) => (
              <Fragment key={definition.id}>
                {isDrillIn(definition) ? null : (
                  <SectionLabel isFirst={index === 0}>
                    {definition.type === "sort"
                      ? t("source_search_filters_sorting")
                      : definition.title}
                  </SectionLabel>
                )}
                <ModalSectionBody bare={definition.type === "select" && definition.options.length <= 4}>
                  {definition.type === "sort" ? (
                    <SortOptions
                      definition={definition}
                      values={draft}
                      onApply={applyDraft}
                    />
                  ) : definition.type === "multiSelect" ? (
                    isDrillIn(definition) ? (
                      <DrillInRow
                        label={definition.title}
                        summary={drillSummary(draft, definition)}
                        onPress={() => setDetailId(definition.id)}
                      />
                    ) : (
                      <MultiSelectOptions
                        definition={definition}
                        values={draft}
                        onApply={applyDraft}
                        variant={multiSelectVariant(definition)}
                        showMatchMode={false}
                      />
                    )
                  ) : definition.type === "select" ? (
                    <SelectOptions
                      definition={definition}
                      values={draft}
                      onApply={applyDraft}
                    />
                  ) : definition.type === "text" ? (
                    <TextOptions
                      definition={definition}
                      values={draft}
                      onApply={applyDraft}
                    />
                  ) : definition.type === "check" ? (
                    <CheckOptions
                      definition={definition}
                      values={draft}
                      onApply={applyDraft}
                    />
                  ) : definition.type === "range" ? (
                    <RangeOptions
                      definition={definition}
                      values={draft}
                      onApply={applyDraft}
                    />
                  ) : null}
                </ModalSectionBody>
              </Fragment>
            ))}
            <View style={styles.resetWrap}>
              <Card>
                <Pressable
                  onPress={resetDraft}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.choiceRow,
                    styles.resetRow,
                    pressed && { backgroundColor: colors.quaternaryFill },
                  ]}
                >
                  <ThemedText variant="body" color="destructive">
                    {t("source_search_filters_reset")}
                  </ThemedText>
                </Pressable>
              </Card>
            </View>
              </>
            )}
          </KeyboardAwareScrollView>

        </SwipeDismissSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Segmented controls sit directly on the sheet (no card), every other control lives in a grouped card. */
const SELECTED_BAR_HEIGHT = 52;

/** Pinned under the header of the genre/tag screen: how many options are chosen, each one removable with a tap. */
function SelectedBar({
  definition,
  values,
  showMatchMode,
  onApply,
}: {
  definition: MultiSelectDefinition;
  values: FilterValue[];
  showMatchMode: boolean;
  onApply: (next: FilterValue) => void;
}) {
  const { colors, radius } = useTheme();
  const { included, excluded, matchAll } = getMultiSelectState(values, definition);
  const count = included.length + excluded.length;
  const labelOf = (id: string) =>
    definition.options.find((option) => option.id === id)?.label ?? id;

  const remove = (id: string) =>
    onApply({
      type: "multiSelect",
      id: definition.id,
      included: included.filter((value) => value !== id),
      excluded: excluded.filter((value) => value !== id),
      ...(showMatchMode ? { matchAll } : {}),
    });

  return (
    <View
      style={[
        styles.selectedBar,
        {
          top: MODAL_HEADER_HEIGHT,
          backgroundColor: colors.systemBackground,
          borderBottomColor: colors.separator,
        },
      ]}
    >
      <ThemedText variant="subheadline" color="secondaryLabel" style={styles.selectedCount}>
        {t("source_search_filters_selected")}: {count}
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.selectedChips}
        keyboardShouldPersistTaps="handled"
      >
        {[...included, ...excluded].map((id) => (
          <Pressable
            key={id}
            onPress={() => remove(id)}
            accessibilityRole="button"
            accessibilityLabel={labelOf(id)}
            style={[
              styles.selectedChip,
              {
                borderRadius: radius.pill,
                backgroundColor: excluded.includes(id) ? colors.destructive : colors.tint,
              },
            ]}
          >
            <ThemedText variant="subheadline" color="onTint" numberOfLines={1}>
              {labelOf(id)}
            </ThemedText>
            <Ionicons name="close" size={14} color={colors.onTint} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function isDrillIn(definition: FilterDefinition): boolean {
  return (
    definition.type === "multiSelect" && multiSelectVariant(definition) === "tags"
  );
}

function drillSummary(values: FilterValue[], definition: MultiSelectDefinition): string {
  const { included, excluded } = getMultiSelectState(values, definition);
  const count = included.length + excluded.length;
  if (count === 0) return "";
  if (count === 1) {
    const id = included[0] ?? excluded[0];
    return definition.options.find((option) => option.id === id)?.label ?? "1";
  }
  return t("library_filter_sources_count", { count: String(count) });
}

/** Row that opens a dedicated screen with a searchable list (for long option sets such as genres and tags). */
function DrillInRow({
  label,
  summary,
  onPress,
}: {
  label: string;
  summary: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.choiceRow,
        pressed && { backgroundColor: colors.quaternaryFill },
      ]}
    >
      <ThemedText variant="body">{label}</ThemedText>
      <ThemedText variant="body" color="secondaryLabel" numberOfLines={1} style={styles.drillSummary}>
        {summary}
      </ThemedText>
      <Ionicons name="chevron-forward" size={16} color={colors.tertiaryLabel} />
    </Pressable>
  );
}

function ModalSectionBody({ bare, children }: { bare: boolean; children: React.ReactNode }) {
  return bare ? <View>{children}</View> : <Card style={styles.modalSectionCard}>{children}</Card>;
}

function ModalHeaderButton({
  label,
  onPress,
  primary,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const { radius } = useTheme();

  return (
    <GlassSurface glassStyle="regular" borderRadius={radius.pill}>
      <Pressable
        style={styles.modalHeaderButton}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <ThemedText variant="headline" color={primary ? "tint" : "label"}>
          {label}
        </ThemedText>
      </Pressable>
    </GlassSurface>
  );
}

/** Settings-style row with a trailing checkmark; `excluded` shows a red cross instead (tri-state filters). */
const ChoiceRow = memo(function ChoiceRow({
  label,
  selected,
  excluded,
  onPress,
  id,
  onToggle,
}: {
  label: string;
  selected: boolean;
  excluded?: boolean;
  onPress?: () => void;
  /** With `onToggle`, lets long lists pass one stable callback instead of a new closure per row. */
  id?: string;
  onToggle?: (id: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onToggle && id !== undefined ? () => onToggle(id) : onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected || Boolean(excluded) }}
      style={({ pressed }) => [
        styles.choiceRow,
        pressed && { backgroundColor: colors.quaternaryFill },
      ]}
    >
      <ThemedText
        variant="body"
        style={styles.choiceLabel}
        color={excluded ? "destructive" : undefined}
      >
        {label}
      </ThemedText>
      {excluded ? (
        <Ionicons name="close" size={20} color={colors.destructive} />
      ) : selected ? (
        <Ionicons name="checkmark" size={20} color={colors.tint} />
      ) : null}
    </Pressable>
  );
});

function ChoiceList({ children }: { children: React.ReactNode[] }) {
  return (
    <View>
      {children.map((child, index) => (
        <Fragment key={index}>
          {index > 0 ? <CardSeparator /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

function SelectOptionsImpl({
  definition,
  values,
  onApply,
  compact,
  inline,
}: {
  definition: Extract<FilterDefinition, { type: "select" }>;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  compact?: boolean;
  /** Inside the dropdown panel: always a checkmark list instead of a segmented control or pull-down menu. */
  inline?: boolean;
}) {
  const { colors, radius } = useTheme();
  const current = values.find(
    (value): value is Extract<FilterValue, { type: "select" }> =>
      value.id === definition.id && value.type === "select",
  );
  const selected =
    current?.value ?? definition.default ?? definition.options[0]?.id ?? "";

  if (!compact && inline) {
    return (
      <ChoiceList>
        {definition.options.map((option) => (
          <ChoiceRow
            key={option.id}
            label={option.label}
            selected={selected === option.id}
            onPress={() => onApply({ type: "select", id: definition.id, value: option.id })}
          />
        ))}
      </ChoiceList>
    );
  }

  if (!compact) {
    if (definition.options.length <= 4) {
      return (
        <OptionSegmentedControl
          options={definition.options}
          selectedId={selected}
          onSelect={(id) => onApply({ type: "select", id: definition.id, value: id })}
        />
      );
    }
    return (
      <MenuPickerRow
        label={definition.title}
        options={definition.options}
        selectedId={selected}
        onSelect={(id) => onApply({ type: "select", id: definition.id, value: id })}
      />
    );
  }

  return (
    <View style={[styles.pillGrid, compact && styles.pillGridCompact]}>
      {definition.options.map((option) => {
        const isSelected = selected === option.id;
        if (isSelected) {
          return (
            <Pressable
              key={option.id}
              style={[
                styles.sortPillActive,
                { borderRadius: radius.pill, backgroundColor: colors.tint },
              ]}
              onPress={() =>
                onApply({ type: "select", id: definition.id, value: option.id })
              }
            >
              <ThemedText
                variant="subheadline"
                color="onTint"
                numberOfLines={1}
              >
                {option.label}
              </ThemedText>
            </Pressable>
          );
        }

        return (
          <GlassSurface glassStyle="regular"
            key={option.id}
            tintColor={colors.tertiaryFill}
            borderRadius={radius.pill}
          >
            <Pressable
              style={styles.sortPill}
              onPress={() =>
                onApply({ type: "select", id: definition.id, value: option.id })
              }
            >
              <ThemedText variant="subheadline" numberOfLines={1}>
                {option.label}
              </ThemedText>
            </Pressable>
          </GlassSurface>
        );
      })}
    </View>
  );
}

function SortOptionsImpl({
  definition,
  values,
  onApply,
  compact,
  inline,
}: {
  definition: Extract<FilterDefinition, { type: "sort" }>;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  compact?: boolean;
  inline?: boolean;
}) {
  const { colors, radius } = useTheme();
  const current = values.find((value) => value.id === definition.id);
  const selectedIndex =
    current?.type === "sort" ? current.index : (definition.default ?? 0);
  const defaultAscending = definition.defaultAscending ?? true;

  if (!compact && inline) {
    return (
      <ChoiceList>
        {definition.options.map((option, index) => (
          <ChoiceRow
            key={`${definition.id}-${index}`}
            label={option}
            selected={selectedIndex === index}
            onPress={() =>
              onApply({
                type: "sort",
                id: definition.id,
                index,
                ascending:
                  current?.type === "sort" && selectedIndex === index
                    ? current.ascending
                    : index === (definition.default ?? 0)
                      ? defaultAscending
                      : false,
              })
            }
          />
        ))}
      </ChoiceList>
    );
  }

  if (!compact) {
    return (
      <MenuPickerRow
        label={definition.title}
        options={definition.options.map((option, index) => ({ id: String(index), label: option }))}
        selectedId={String(selectedIndex)}
        onSelect={(id) => {
          const index = Number(id);
          onApply({
            type: "sort",
            id: definition.id,
            index,
            ascending:
              current?.type === "sort" && selectedIndex === index
                ? current.ascending
                : index === (definition.default ?? 0)
                  ? defaultAscending
                  : false,
          });
        }}
      />
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.sortRow, compact && styles.sortRowCompact]}
      keyboardShouldPersistTaps="handled"
    >
      {definition.options.map((option, index) => {
        const selected = selectedIndex === index;
        const ascending =
          current?.type === "sort" && selected
            ? current.ascending
            : index === (definition.default ?? 0)
              ? defaultAscending
              : false;
        if (selected) {
          return (
            <Pressable
              key={`${definition.id}-${index}`}
              style={[
                styles.sortPillActive,
                { borderRadius: radius.pill, backgroundColor: colors.tint },
              ]}
              onPress={() =>
                onApply({ type: "sort", id: definition.id, index, ascending })
              }
            >
              <ThemedText
                variant="subheadline"
                color="onTint"
                numberOfLines={1}
              >
                {option}
              </ThemedText>
              {compact ? (
                <Ionicons name="chevron-down" size={13} color={colors.onTint} />
              ) : null}
            </Pressable>
          );
        }

        return (
          <GlassSurface glassStyle="regular"
            key={`${definition.id}-${index}`}
            borderRadius={radius.pill}
            tintColor={colors.tertiaryFill}
          >
            <Pressable
              style={styles.sortPill}
              onPress={() =>
                onApply({
                  type: "sort",
                  id: definition.id,
                  index,
                  ascending:
                    index === (definition.default ?? 0)
                      ? defaultAscending
                      : false,
                })
              }
            >
              <ThemedText variant="subheadline" numberOfLines={1}>
                {option}
              </ThemedText>
            </Pressable>
          </GlassSurface>
        );
      })}
    </ScrollView>
  );
}

function MatchModeToggle({
  matchAll,
  onChange,
}: {
  matchAll: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <OptionSegmentedControl
      options={[
        { id: "and", label: t("source_search_filters_match_and") },
        { id: "or", label: t("source_search_filters_match_or") },
      ]}
      selectedId={matchAll ? "and" : "or"}
      onSelect={(id) => onChange(id === "and")}
    />
  );
}

const PillOption = memo(function PillOption({
  id,
  label,
  selected,
  excluded,
  glass,
  onToggle,
}: {
  id: string;
  label: string;
  selected: boolean;
  excluded?: boolean;
  glass: boolean;
  onToggle: (id: string) => void;
}) {
  const { colors, radius } = useTheme();
  if (excluded) {
    return (
      <Pressable
        style={[
          styles.sortPillActive,
          { borderRadius: radius.pill, backgroundColor: colors.destructive },
        ]}
        onPress={() => onToggle(id)}
      >
        <ThemedText variant="callout" color="onTint" numberOfLines={1}>
          {label}
        </ThemedText>
      </Pressable>
    );
  }
  if (selected) {
    return (
      <Pressable
        style={[
          styles.sortPillActive,
          { borderRadius: radius.pill, backgroundColor: colors.tint },
        ]}
        onPress={() => onToggle(id)}
      >
        <ThemedText variant="callout" color="onTint" numberOfLines={1}>
          {label}
        </ThemedText>
      </Pressable>
    );
  }

  if (!glass) {
    return (
      <Pressable
        style={[
          styles.sortPill,
          { borderRadius: radius.pill, backgroundColor: colors.secondaryFill },
        ]}
        onPress={() => onToggle(id)}
      >
        <ThemedText variant="subheadline" numberOfLines={1}>
          {label}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <GlassSurface glassStyle="regular" tintColor={colors.tertiaryFill} borderRadius={radius.pill}>
      <Pressable style={styles.sortPill} onPress={() => onToggle(id)}>
        <ThemedText variant="subheadline" numberOfLines={1}>
          {label}
        </ThemedText>
      </Pressable>
    </GlassSurface>
  );
});

const CheckboxOption = memo(function CheckboxOption({
  id,
  label,
  selected,
  excluded,
  grid,
  onToggle,
}: {
  id: string;
  label: string;
  selected: boolean;
  excluded?: boolean;
  grid: boolean;
  onToggle: (id: string) => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      style={[
        styles.checkboxRow,
        grid && styles.checkboxGridItem,
        (selected || excluded) && {
          backgroundColor: colors.secondaryFill,
          borderRadius: radius.sm,
        },
      ]}
      onPress={() => onToggle(id)}
    >
      <Ionicons
        name={excluded ? "close-circle" : selected ? "checkbox" : "square-outline"}
        size={22}
        color={
          excluded
            ? colors.destructive
            : selected
              ? colors.tint
              : colors.tertiaryLabel
        }
      />
      <ThemedText
        variant="body"
        numberOfLines={1}
        color={excluded ? "destructive" : undefined}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
});

const TagOption = memo(function TagOption({
  id,
  label,
  selected,
  excluded,
  glass,
  onToggle,
}: {
  id: string;
  label: string;
  selected: boolean;
  excluded?: boolean;
  glass: boolean;
  onToggle: (id: string) => void;
}) {
  const { colors, radius } = useTheme();
  if (excluded) {
    return (
      <Pressable
        style={[
          styles.tag,
          styles.tagSelected,
          { borderRadius: radius.pill, backgroundColor: colors.destructive },
        ]}
        onPress={() => onToggle(id)}
      >
        <ThemedText variant="callout" color="onTint" numberOfLines={1}>
          {label}
        </ThemedText>
      </Pressable>
    );
  }
  if (selected) {
    return (
      <Pressable
        style={[
          styles.tag,
          styles.tagSelected,
          { borderRadius: radius.pill, backgroundColor: colors.tint },
        ]}
        onPress={() => onToggle(id)}
      >
        <ThemedText variant="callout" color="onTint" numberOfLines={1}>
          {label}
        </ThemedText>
      </Pressable>
    );
  }

  if (!glass) {
    return (
      <Pressable
        style={[
          styles.tag,
          { borderRadius: radius.pill, backgroundColor: colors.secondaryFill },
        ]}
        onPress={() => onToggle(id)}
      >
        <ThemedText variant="subheadline" numberOfLines={1}>
          {label}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <GlassSurface glassStyle="regular" tintColor={colors.tertiaryFill} borderRadius={radius.pill}>
      <Pressable style={styles.tag} onPress={() => onToggle(id)}>
        <ThemedText variant="subheadline" numberOfLines={1}>
          {label}
        </ThemedText>
      </Pressable>
    </GlassSurface>
  );
});

function ShowMoreButton({
  remaining,
  onPress,
}: {
  remaining: number;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.showMore,
        { borderRadius: radius.pill, backgroundColor: colors.secondaryFill },
      ]}
    >
      <ThemedText variant="subheadline" color="secondaryLabel">
        {t("source_search_filters_show_more", { count: String(remaining) })}
      </ThemedText>
    </Pressable>
  );
}

function MultiSelectOptionsImpl({
  definition,
  values,
  onApply,
  compact,
  variant,
  columns = 1,
  showMatchMode,
  query: controlledQuery,
  onQueryChange,
}: {
  definition: MultiSelectDefinition;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  compact?: boolean;
  variant: "checkbox" | "tags" | "pills" | "list";
  columns?: number;
  showMatchMode?: boolean;
  query?: string;
  onQueryChange?: (query: string) => void;
}) {
  const { colors, radius } = useTheme();
  const [localQuery, setLocalQuery] = useState("");
  // Inline dropdown: tag lists are filled with glass tags down to the bottom of the screen
  // (see fillScreen below); the search field reaches the rest.
  const fillScreen =
    Boolean(compact) && variant !== "pills" && variant !== "checkbox";
  const initialLimit = fillScreen ? INLINE_TAGS_START : OPTION_PAGE_SIZE;
  const gridRef = useRef<ComponentRef<typeof View>>(null);
  const { height: screenHeight } = useRNWindowDimensions();
  const [limit, setLimit] = useState(initialLimit);
  const query = controlledQuery ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;
  const deferredQuery = useDeferredValue(query);
  const { included, excluded, matchAll } = getMultiSelectState(
    values,
    definition,
  );

  const includedSet = useMemo(() => new Set(included), [included]);
  const excludedSet = useMemo(() => new Set(excluded), [excluded]);
  const canExclude = Boolean(definition.canExclude);
  const optionById = useMemo(() => {
    const map = new Map<string, MultiSelectOption>();
    for (const option of definition.options) map.set(option.id, option);
    return map;
  }, [definition.options]);

  const latest = useRef({
    included,
    excluded,
    matchAll,
    showMatchMode,
    canExclude,
    definitionId: definition.id,
    onApply,
  });
  useLayoutEffect(() => {
    latest.current = {
      included,
      excluded,
      matchAll,
      showMatchMode,
      canExclude,
      definitionId: definition.id,
      onApply,
    };
  });

  useEffect(() => {
    setLimit(initialLimit);
  }, [deferredQuery]);

  const visibleOptions = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    if (!normalized || variant === "checkbox") return definition.options;
    return definition.options.filter((option) =>
      option.label.toLowerCase().includes(normalized),
    );
  }, [definition.options, deferredQuery, variant]);

  const selectedOptions = useMemo(() => {
    const result: MultiSelectOption[] = [];
    for (const id of [...included, ...excluded]) {
      const option = optionById.get(id);
      if (option) result.push(option);
    }
    return result;
  }, [optionById, included, excluded]);

  const unselectedOptions = useMemo(
    () =>
      visibleOptions.filter(
        (option) => !includedSet.has(option.id) && !excludedSet.has(option.id),
      ),
    [visibleOptions, includedSet, excludedSet],
  );

  const toggleOption = useCallback((optionId: string) => {
    const state = latest.current;
    const commit = (nextIncluded: string[], nextExcluded: string[]) => {
      state.onApply({
        type: "multiSelect",
        id: state.definitionId,
        included: nextIncluded,
        excluded: nextExcluded,
        ...(state.showMatchMode ? { matchAll: state.matchAll } : {}),
      });
    };

    // none -> included -> excluded (only when the filter allows it) -> none
    if (state.included.includes(optionId)) {
      const nextIncluded = state.included.filter((id) => id !== optionId);
      commit(
        nextIncluded,
        state.canExclude
          ? [optionId, ...state.excluded.filter((id) => id !== optionId)]
          : state.excluded.filter((id) => id !== optionId),
      );
      return;
    }
    if (state.excluded.includes(optionId)) {
      commit(
        state.included,
        state.excluded.filter((id) => id !== optionId),
      );
      return;
    }
    commit([optionId, ...state.included], state.excluded);
  }, []);

  const showMore = useCallback(
    () => setLimit((current) => current + OPTION_PAGE_SIZE),
    [],
  );


  if (variant === "list") {
    const shown = visibleOptions.slice(0, limit);
    const remaining = visibleOptions.length - shown.length;
    return (
      <View style={styles.listVariant}>
        {showMatchMode ? (
          <MatchModeToggle
            matchAll={matchAll}
            onChange={(next) =>
              onApply({
                type: "multiSelect",
                id: definition.id,
                included,
                excluded,
                matchAll: next,
              })
            }
          />
        ) : null}
        <View style={[styles.searchField, { backgroundColor: colors.tertiaryFill }]}>
          <Ionicons name="search" size={16} color={colors.secondaryLabel} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("search")}
            placeholderTextColor={colors.secondaryLabel}
            accessibilityLabel={t("search")}
            style={[styles.searchInput, { color: colors.label }]}
            clearButtonMode="while-editing"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
          />
        </View>
        {shown.length > 0 ? (
          <Card>
            <ChoiceList>
              {shown.map((option) => (
                <ChoiceRow
                  key={option.id}
                  label={option.label}
                  selected={includedSet.has(option.id)}
                  excluded={excludedSet.has(option.id)}
                  id={option.id}
                  onToggle={toggleOption}
                />
              ))}
            </ChoiceList>
          </Card>
        ) : null}
        {remaining > 0 ? (
          <ShowMoreButton remaining={remaining} onPress={showMore} />
        ) : null}
      </View>
    );
  }

  if (variant !== "tags" && !compact) {
    const shown = definition.options.slice(0, limit);
    const remaining = definition.options.length - shown.length;
    return (
      <View>
        <ChoiceList>
          {shown.map((option) => (
            <ChoiceRow
              key={option.id}
              label={option.label}
              selected={includedSet.has(option.id)}
              excluded={excludedSet.has(option.id)}
              id={option.id}
              onToggle={toggleOption}
            />
          ))}
        </ChoiceList>
        {remaining > 0 ? (
          <View style={styles.modalPad}>
            <ShowMoreButton remaining={remaining} onPress={showMore} />
          </View>
        ) : null}
      </View>
    );
  }

  if (variant === "pills") {
    const shown = definition.options.slice(0, limit);
    const remaining = definition.options.length - shown.length;
    return (
      <View style={[styles.pillGrid, compact && styles.pillGridCompact]}>
        {shown.map((option, index) => (
          <PillOption
            key={option.id}
            id={option.id}
            label={option.label}
            selected={includedSet.has(option.id)}
            excluded={excludedSet.has(option.id)}
            glass={Boolean(compact) && index < GLASS_OPTION_LIMIT}
            onToggle={toggleOption}
          />
        ))}
        {remaining > 0 ? (
          <ShowMoreButton remaining={remaining} onPress={showMore} />
        ) : null}
      </View>
    );
  }

  if (variant === "checkbox") {
    const useGrid = columns > 1;
    const shown = definition.options.slice(0, limit);
    const remaining = definition.options.length - shown.length;

    return (
      <View
        style={[
          styles.optionList,
          compact && styles.optionListCompact,
          useGrid && styles.checkboxGrid,
        ]}
      >
        {shown.map((option) => (
          <CheckboxOption
            key={option.id}
            id={option.id}
            label={option.label}
            selected={includedSet.has(option.id)}
            excluded={excludedSet.has(option.id)}
            grid={useGrid}
            onToggle={toggleOption}
          />
        ))}
        {remaining > 0 ? (
          <ShowMoreButton remaining={remaining} onPress={showMore} />
        ) : null}
      </View>
    );
  }

  const shownTags = unselectedOptions.slice(0, limit);
  const remainingTags = unselectedOptions.length - shownTags.length;

  return (
    <View style={compact ? styles.dropdown : [styles.genreModalSection, styles.modalPad]}>
      {showMatchMode ? (
        <MatchModeToggle
          matchAll={matchAll}
          onChange={(next) =>
            onApply({
              type: "multiSelect",
              id: definition.id,
              included,
              excluded,
              matchAll: next,
            })
          }
        />
      ) : null}

      {compact ? (
        <GlassSurface
          glassStyle="regular"
          borderRadius={radius.md}
          style={styles.textInputView}
        >
        <ThemedText
          variant="body"
          style={{ width: "40%", paddingLeft: Spacing.md }}
        >{`${definition.title}`}</ThemedText>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={definition.title}
          placeholderTextColor={colors.tertiaryLabel}
          style={[styles.genreSearch, { color: colors.label }]}
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          textContentType="none"
        />
        </GlassSurface>
      ) : (
        <View style={styles.textInputView}>
        <ThemedText
          variant="body"
          style={{ width: "40%", paddingLeft: Spacing.md }}
        >{`${definition.title}`}</ThemedText>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={definition.title}
          placeholderTextColor={colors.tertiaryLabel}
          style={[styles.genreSearch, { color: colors.label }]}
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          textContentType="none"
        />
        </View>
      )}

      {selectedOptions.length > 0 ? (
        <View style={styles.selectedSection}>
          <ThemedText variant="footnote" color="secondaryLabel">
            {t("source_search_filters_selected")}
          </ThemedText>
          <View style={styles.tagGrid}>
            {selectedOptions.map((option) => (
              <TagOption
                key={`selected-${option.id}`}
                id={option.id}
                label={option.label}
                selected={includedSet.has(option.id)}
                excluded={excludedSet.has(option.id)}
                glass={false}
                onToggle={toggleOption}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View
        ref={gridRef}
        style={styles.tagGrid}
        onLayout={() => {
          if (!fillScreen || remainingTags <= 0 || limit >= INLINE_TAGS_MAX) return;
          // Keep adding tags until the grid reaches the bottom of the screen.
          gridRef.current?.measureInWindow((_x, y, _w, h) => {
            if (y + h < screenHeight - INLINE_TAGS_BOTTOM_RESERVE) {
              setLimit((current) => current + INLINE_TAGS_STEP);
            }
          });
        }}
      >
        {shownTags.map((option) => (
          <TagOption
            key={option.id}
            id={option.id}
            label={option.label}
            selected={false}
            glass={Boolean(compact)}
            onToggle={toggleOption}
          />
        ))}
        {remainingTags > 0 && !fillScreen ? (
          <ShowMoreButton remaining={remainingTags} onPress={showMore} />
        ) : null}
      </View>
    </View>
  );
}

function TextOptionsImpl({
  definition,
  values,
  onApply,
  compact,
}: {
  definition: Extract<FilterDefinition, { type: "text" }>;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  compact?: boolean;
}) {
  const { colors, radius } = useTheme();
  const value =
    values.find(
      (entry): entry is Extract<FilterValue, { type: "text" }> =>
        entry.id === definition.id && entry.type === "text",
    )?.value ?? "";

  if (!compact) {
    return (
      <View style={styles.choiceRow}>
        <TextInput
          clearButtonMode="while-editing"
          value={value}
          onChangeText={(text) => onApply({ type: "text", id: definition.id, value: text })}
          placeholder={definition.placeholder ?? definition.title}
          placeholderTextColor={colors.tertiaryLabel}
          accessibilityLabel={definition.title}
          style={[styles.modalTextInput, { color: colors.label }]}
        />
      </View>
    );
  }

  return (
    <View style={compact ? styles.dropdown : undefined}>
      <TextInput
 clearButtonMode="while-editing"
        value={value}
        onChangeText={(text) =>
          onApply({ type: "text", id: definition.id, value: text })
        }
        placeholder={definition.placeholder ?? definition.title}
        placeholderTextColor={colors.tertiaryLabel}
        style={[
          styles.textInput,
          {
            color: colors.label,
            backgroundColor: colors.secondaryFill,
            borderRadius: radius.sm,
          },
        ]}
      />
    </View>
  );
}

function CheckOptionsImpl({
  definition,
  values,
  onApply,
  compact,
}: {
  definition: Extract<FilterDefinition, { type: "check" }>;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  compact?: boolean;
}) {
  const { colors, radius } = useTheme();
  const checked =
    values.find(
      (entry): entry is Extract<FilterValue, { type: "check" }> =>
        entry.id === definition.id && entry.type === "check",
    )?.value ??
    definition.default ??
    false;

  if (!compact) {
    return (
      <View style={styles.choiceRow}>
        <ThemedText variant="body" style={styles.choiceLabel}>
          {definition.title}
        </ThemedText>
        <Switch
          accessibilityLabel={definition.title}
          value={checked}
          onValueChange={(value) => onApply({ type: "check", id: definition.id, value })}
        />
      </View>
    );
  }

  return (
    <View style={compact ? styles.dropdown : styles.optionList}>
      <Pressable
        style={[
          styles.checkboxRow,
          checked && {
            backgroundColor: colors.secondaryFill,
            borderRadius: radius.sm,
          },
        ]}
        onPress={() =>
          onApply({ type: "check", id: definition.id, value: !checked })
        }
      >
        <Ionicons
          name={checked ? "checkbox" : "square-outline"}
          size={22}
          color={checked ? colors.tint : colors.tertiaryLabel}
        />
        <ThemedText variant="body">{definition.title}</ThemedText>
      </Pressable>
    </View>
  );
}

function formatRangeBound(value: number | undefined): string {
  return value == null || !Number.isFinite(value) ? "" : String(value);
}

function parseRangeBound(text: string): number | undefined {
  const normalized = text.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function RangeOptionsImpl({
  definition,
  values,
  onApply,
  compact,
}: {
  definition: Extract<FilterDefinition, { type: "range" }>;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  compact?: boolean;
}) {
  const { colors, radius } = useTheme();
  const current = values.find(
    (entry): entry is Extract<FilterValue, { type: "range" }> =>
      entry.id === definition.id && entry.type === "range",
  );
  const [fromText, setFromText] = useState(formatRangeBound(current?.from));
  const [toText, setToText] = useState(formatRangeBound(current?.to));

  useEffect(() => {
    if (parseRangeBound(fromText) !== current?.from) {
      setFromText(formatRangeBound(current?.from));
    }
    if (parseRangeBound(toText) !== current?.to) {
      setToText(formatRangeBound(current?.to));
    }
  }, [current?.from, current?.to]);

  const inputStyle = [
    styles.rangeInput,
    {
      color: colors.label,
      backgroundColor: colors.secondaryFill,
      borderRadius: radius.sm,
    },
  ];

  return (
    <View style={[styles.rangeRow, compact && styles.dropdown]}>
      <TextInput
        value={fromText}
        onChangeText={(text) => {
          setFromText(text);
          onApply({
            type: "range",
            id: definition.id,
            from: parseRangeBound(text),
            to: parseRangeBound(toText),
          });
        }}
        keyboardType="decimal-pad"
        placeholder={
          definition.min != null
            ? String(definition.min)
            : t("filter_range_from")
        }
        placeholderTextColor={colors.tertiaryLabel}
        style={inputStyle}
      />
      <ThemedText variant="body" color="secondaryLabel">
        –
      </ThemedText>
      <TextInput
        value={toText}
        onChangeText={(text) => {
          setToText(text);
          onApply({
            type: "range",
            id: definition.id,
            from: parseRangeBound(fromText),
            to: parseRangeBound(text),
          });
        }}
        keyboardType="decimal-pad"
        placeholder={
          definition.max != null ? String(definition.max) : t("filter_range_to")
        }
        placeholderTextColor={colors.tertiaryLabel}
        style={inputStyle}
      />
    </View>
  );
}

const SelectOptions = memo(SelectOptionsImpl, sameFilterProps);
const RangeOptions = memo(RangeOptionsImpl, sameFilterProps);
const SortOptions = memo(SortOptionsImpl, sameFilterProps);
const TextOptions = memo(TextOptionsImpl, sameFilterProps);
const CheckOptions = memo(CheckOptionsImpl, sameFilterProps);
const MultiSelectOptions = memo(MultiSelectOptionsImpl, sameFilterProps);

const styles = StyleSheet.create({
  bar: {
    flexGrow: 0,
    flexShrink: 0,
    gap: Spacing.sm,
  },
  // Extends far below the bar so it dims the results list behind the open dropdown.
  dim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4000,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  iconChip: {
    flexShrink: 0,
  },
  iconChipPressable: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    maxWidth: 220,
  },
  chipPressable: {
    height: 40,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  chipActive: {
    height: 40,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
    maxWidth: 220,
  },
  dropdown: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    gap: Spacing.sm,
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  sortRowCompact: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  sortPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sortPillActive: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  optionList: {
    gap: Spacing.xs,
  },
  optionListCompact: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  checkboxGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  checkboxGridItem: {
    width: "50%",
  },
  genreModalSection: {
    gap: Spacing.sm,
  },
  genreSearchWrap: {
    width: "100%",
  },
  genreSearch: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    textAlign: "end",
    alignContent: "flex-end",
    alignItems: "flex-end",
    width: "60%",
    fontSize: 17,
    minHeight: 44,
  },
  selectedSection: {
    gap: Spacing.xs,
  },
  showMore: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  tagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  tag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  tagSelected: {
    maxWidth: "100%",
  },
  textInput: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 60,
    fontSize: 17,
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.sm,
  },
  rangeInput: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 44,
    fontSize: 17,
  },
  textInputView: {
    flexDirection: "row",
    alignContent: "center",
    alignItems: "center",
    minHeight: 60,
  },
  modal: {
    flex: 1,
  },
  modalAvoiding: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  modalTitle: {
    flex: 1,
    textAlign: "center",
  },
  modalHeaderButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minWidth: 96,
    alignItems: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  // Sized to the content up to the sheet's maximum height, then scrolls.
  modalScrollFit: {
    flexGrow: 0,
    flexShrink: 1,
  },
  modalScrollFill: {
    flex: 1,
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  modalSectionCard: {},
  panelScroll: {
    borderRadius: 20,
    overflow: "hidden",
  },
  panel: {
    marginHorizontal: Spacing.lg,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 8,
  },
  modalPad: {
    padding: Spacing.lg,
  },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: 48,
  },
  resetWrap: {
    marginTop: Spacing.lg,
  },
  resetRow: {
    justifyContent: "center",
  },
  selectedBar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: SELECTED_BAR_HEIGHT,
    zIndex: 5,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: Spacing.lg,
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  selectedCount: {
    flexShrink: 0,
  },
  selectedChips: {
    alignItems: "center",
    gap: Spacing.xs,
    paddingRight: Spacing.lg,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    maxWidth: 200,
  },
  drillSummary: {
    flex: 1,
    textAlign: "right",
  },
  listVariant: {
    gap: Spacing.sm,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    minHeight: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    minHeight: 40,
  },
  choiceLabel: {
    flex: 1,
  },
  modalTextInput: {
    flex: 1,
    fontSize: 17,
    minHeight: 40,
  },
  modalFooter: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerButton: {
    width: "100%",
  },
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  pillGridCompact: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
});
