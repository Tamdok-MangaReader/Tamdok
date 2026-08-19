import { Ionicons } from '@expo/vector-icons';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/card';
import { GlassDestructiveButton } from '@/components/ui/glass-destructive-button';
import { GlassSegmentedControl } from '@/components/ui/glass-segmented-control';
import { GlassSurface } from '@/components/ui/glass-surface';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';
import { defaultFilterValues, filterLabel, isInlineFilter, updateFilterValue } from '@/parsers/shared/filters';
import type { FilterDefinition, FilterValue } from '@/parsers/shared/types';

type MangaSearchFilterBarProps = {
  definitions: FilterDefinition[];
  values: FilterValue[];
  onChange: (values: FilterValue[]) => void;
};

function getMultiSelectState(values: FilterValue[], definition: Extract<FilterDefinition, { type: 'multiSelect' }>) {
  const current = values.find(
    (value): value is Extract<FilterValue, { type: 'multiSelect' }> =>
      value.id === definition.id && value.type === 'multiSelect',
  );
  return {
    included: current?.included ?? [],
    excluded: current?.excluded ?? [],
    matchAll: current?.matchAll ?? false,
  };
}

function hasDedicatedMatchMode(definitions: FilterDefinition[], field: 'genres' | 'tags'): boolean {
  const id = field === 'genres' ? 'genres_match_mode' : 'tags_match_mode';
  return definitions.some((definition) => definition.id === id);
}

function multiSelectVariant(
  definition: Extract<FilterDefinition, { type: 'multiSelect' }>,
): 'checkbox' | 'tags' | 'pills' {
  if (definition.id === 'genres' || definition.id === 'tags') return 'tags';
  if (definition.usesTagStyle) return 'pills';
  if (definition.id === 'status' || definition.id === 'type') return 'pills';
  return 'checkbox';
}

function shouldShowMatchMode(definition: Extract<FilterDefinition, { type: 'multiSelect' }>, definitions: FilterDefinition[]) {
  if (definition.id === 'genres') return !hasDedicatedMatchMode(definitions, 'genres');
  if (definition.id === 'tags') return !hasDedicatedMatchMode(definitions, 'tags');
  return false;
}

export function MangaSearchFilterBar({ definitions, values, onChange }: MangaSearchFilterBarProps) {
  const { colors } = useTheme();
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const inlineDefinitions = useMemo(() => definitions.filter(isInlineFilter), [definitions]);

  if (definitions.length === 0) return null;

  const openDefinition = inlineDefinitions.find((definition) => definition.id === openFilterId) ?? null;

  const toggleFilter = (definitionId: string) => {
    setOpenFilterId((current) => (current === definitionId ? null : definitionId));
  };

  const applyValue = (next: FilterValue) => {
    onChange(updateFilterValue(values, next));
  };

  const openModal = () => {
    setOpenFilterId(null);
    setModalOpen(true);
  };

  return (
    <>
      <View style={styles.bar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.row}
          keyboardShouldPersistTaps='handled'>
          <GlassSurface borderRadius={999} style={styles.iconChip} interactive>
            <Pressable
              style={styles.iconChipPressable}
              onPress={openModal}
              accessibilityRole='button'
              accessibilityLabel={t('source_search_filters')}>
              <Ionicons name='options-outline' size={17} color={colors.label} />
            </Pressable>
          </GlassSurface>

          {inlineDefinitions.map((definition) => {
            const isOpen = openFilterId === definition.id;
            const label = filterLabel(definition, values);

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

      <MangaFilterModal
        visible={modalOpen}
        definitions={definitions}
        values={values}
        onChange={onChange}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();

  if (active) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole='button'
        style={[styles.chipActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}>
        <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
          {label}
        </ThemedText>
        <Ionicons name='chevron-down' size={13} color={colors.onTint} />
      </Pressable>
    );
  }

  return (
    <GlassSurface borderRadius={radius.pill} style={styles.chip} interactive>
      <Pressable style={styles.chipPressable} onPress={onPress} accessibilityRole='button'>
        <ThemedText variant='subheadline' numberOfLines={1}>
          {label}
        </ThemedText>
        <Ionicons name='chevron-down' size={13} color={colors.tertiaryLabel} />
      </Pressable>
    </GlassSurface>
  );
}

function FilterDropdown({
  definitions,
  definition,
  values,
  onApply,
  onClose,
}: {
  definitions: FilterDefinition[];
  definition: FilterDefinition;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  onClose: () => void;
}) {
  switch (definition.type) {
    case 'sort':
      return <SortOptions definition={definition} values={values} onApply={onApply} compact />;
    case 'multiSelect':
      return (
        <MultiSelectOptions
          definition={definition}
          values={values}
          onApply={onApply}
          compact
          variant={multiSelectVariant(definition)}
          showMatchMode={shouldShowMatchMode(definition, definitions)}
        />
      );
    case 'select':
      return <SelectOptions definition={definition} values={values} onApply={onApply} compact />;
    case 'text':
      return <TextOptions definition={definition} values={values} onApply={onApply} compact />;
    case 'check':
      return <CheckOptions definition={definition} values={values} onApply={onApply} compact />;
    default:
      return null;
  }
}

function MangaFilterModal({
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
  const [draft, setDraft] = useState(values);
  const [genreQuery, setGenreQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setDraft(values);
      setGenreQuery('');
      setTagQuery('');
    }
  }, [visible, values]);

  const applyDraft = (next: FilterValue) => {
    setDraft((current) => updateFilterValue(current, next));
  };

  const commitDraft = () => {
    onChange(draft);
    onClose();
  };

  const resetDraft = () => {
    setDraft(defaultFilterValues(definitions));
    setGenreQuery('');
    setTagQuery('');
  };

  return (
    <Modal visible={visible} animationType='slide' presentationStyle='pageSheet' onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalAvoiding}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
        <View style={[styles.modal, { backgroundColor: colors.systemBackground, paddingTop: Spacing.sm }]}>
          <View style={styles.modalHeader}>
            <ModalHeaderButton label={t('cancel')} onPress={onClose} />
            <ThemedText variant='headline' style={styles.modalTitle}>
              {t('source_search_filters')}
            </ThemedText>
            <ModalHeaderButton label={t('source_search_filters_apply')} onPress={commitDraft} primary />
          </View>

          <KeyboardAwareScrollView
            style={styles.modalScroll}
            contentContainerStyle={[styles.modalContent, { paddingBottom: Spacing.xxxl }]}
            keyboardShouldPersistTaps='handled'
            showsVerticalScrollIndicator={false}
            bottomOffset={Spacing.lg}>
            {definitions.map((definition, index) => (
              <Fragment key={definition.id}>
                <SectionLabel isFirst={index === 0}>
                  {definition.type === 'sort' ? t('source_search_filters_sorting') : definition.title}
                </SectionLabel>
                <Card style={styles.modalSectionCard}>
                  {definition.type === 'sort' ? (
                    <SortOptions definition={definition} values={draft} onApply={applyDraft} />
                  ) : definition.type === 'multiSelect' ? (
                    <MultiSelectOptions
                      definition={definition}
                      values={draft}
                      onApply={applyDraft}
                      query={definition.id === 'tags' ? tagQuery : definition.id === 'genres' ? genreQuery : undefined}
                      onQueryChange={
                        definition.id === 'tags'
                          ? setTagQuery
                          : definition.id === 'genres'
                            ? setGenreQuery
                            : undefined
                      }
                      variant={multiSelectVariant(definition)}
                      showMatchMode={shouldShowMatchMode(definition, definitions)}
                    />
                  ) : definition.type === 'select' ? (
                    <SelectOptions definition={definition} values={draft} onApply={applyDraft} />
                  ) : definition.type === 'text' ? (
                    <TextOptions definition={definition} values={draft} onApply={applyDraft} />
                  ) : definition.type === 'check' ? (
                    <CheckOptions definition={definition} values={draft} onApply={applyDraft} />
                  ) : null}
                </Card>
              </Fragment>
            ))}
          </KeyboardAwareScrollView>

          <SafeAreaView
            edges={['bottom']}
            style={[styles.modalFooter, { borderTopColor: colors.separator }]}>
            <GlassDestructiveButton
              label={t('source_search_filters_reset')}
              onPress={resetDraft}
              style={styles.footerButton}
            />
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ModalHeaderButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const { radius } = useTheme();

  return (
    <GlassSurface borderRadius={radius.pill} interactive>
      <Pressable style={styles.modalHeaderButton} onPress={onPress} accessibilityRole='button' accessibilityLabel={label}>
        <ThemedText variant='headline' color={primary ? 'tint' : 'label'}>
          {label}
        </ThemedText>
      </Pressable>
    </GlassSurface>
  );
}

function SelectOptions({
  definition,
  values,
  onApply,
  compact,
}: {
  definition: Extract<FilterDefinition, { type: 'select' }>;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  compact?: boolean;
}) {
  const { colors, radius } = useTheme();
  const current = values.find(
    (value): value is Extract<FilterValue, { type: 'select' }> =>
      value.id === definition.id && value.type === 'select',
  );
  const selected = current?.value ?? definition.default ?? definition.options[0]?.id ?? '';

  return (
    <View style={[styles.pillGrid, compact && styles.pillGridCompact]}>
      {definition.options.map((option) => {
        const isSelected = selected === option.id;
        if (isSelected) {
          return (
            <Pressable
              key={option.id}
              style={[styles.sortPillActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}
              onPress={() => onApply({ type: 'select', id: definition.id, value: option.id })}>
              <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        }

        return (
          <GlassSurface key={option.id} borderRadius={radius.pill} interactive>
            <Pressable
              style={styles.sortPill}
              onPress={() => onApply({ type: 'select', id: definition.id, value: option.id })}>
              <ThemedText variant='subheadline' numberOfLines={1}>
                {option.label}
              </ThemedText>
            </Pressable>
          </GlassSurface>
        );
      })}
    </View>
  );
}

function SortOptions({
  definition,
  values,
  onApply,
  compact,
}: {
  definition: Extract<FilterDefinition, { type: 'sort' }>;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  compact?: boolean;
}) {
  const { colors, radius } = useTheme();
  const current = values.find((value) => value.id === definition.id);
  const selectedIndex = current?.type === 'sort' ? current.index : definition.default ?? 0;
  const defaultAscending = definition.defaultAscending ?? true;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.sortRow, compact && styles.sortRowCompact]}
      keyboardShouldPersistTaps='handled'>
      {definition.options.map((option, index) => {
        const selected = selectedIndex === index;
        const ascending =
          current?.type === 'sort' && selected ? current.ascending : index === (definition.default ?? 0) ? defaultAscending : false;
        if (selected) {
          return (
            <Pressable
              key={`${definition.id}-${index}`}
              style={[styles.sortPillActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}
              onPress={() => onApply({ type: 'sort', id: definition.id, index, ascending })}>
              <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
                {option}
              </ThemedText>
              {compact ? <Ionicons name='chevron-down' size={13} color={colors.onTint} /> : null}
            </Pressable>
          );
        }

        return (
          <GlassSurface key={`${definition.id}-${index}`} borderRadius={radius.pill} interactive>
            <Pressable
              style={styles.sortPill}
              onPress={() =>
                onApply({
                  type: 'sort',
                  id: definition.id,
                  index,
                  ascending: index === (definition.default ?? 0) ? defaultAscending : false,
                })
              }>
              <ThemedText variant='subheadline' numberOfLines={1}>
                {option}
              </ThemedText>
            </Pressable>
          </GlassSurface>
        );
      })}
    </ScrollView>
  );
}

function MatchModeToggle({ matchAll, onChange }: { matchAll: boolean; onChange: (next: boolean) => void }) {
  return (
    <GlassSegmentedControl
      values={[t('source_search_filters_match_and'), t('source_search_filters_match_or')]}
      selectedIndex={matchAll ? 0 : 1}
      onChange={(index) => onChange(index === 0)}
    />
  );
}

function MultiSelectOptions({
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
  definition: Extract<FilterDefinition, { type: 'multiSelect' }>;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  compact?: boolean;
  variant: 'checkbox' | 'tags' | 'pills';
  columns?: number;
  showMatchMode?: boolean;
  query?: string;
  onQueryChange?: (query: string) => void;
}) {
  const { colors, radius } = useTheme();
  const [localQuery, setLocalQuery] = useState('');
  const query = controlledQuery ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;
  const { included, excluded, matchAll } = getMultiSelectState(values, definition);

  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized || variant === 'checkbox') return definition.options;
    return definition.options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [definition.options, query, variant]);

  const selectedOptions = useMemo(
    () =>
      included
        .map((id) => definition.options.find((option) => option.id === id))
        .filter((option): option is (typeof definition.options)[number] => Boolean(option)),
    [definition.options, included],
  );

  const unselectedOptions = useMemo(
    () => visibleOptions.filter((option) => !included.includes(option.id)),
    [visibleOptions, included],
  );

  const commitIncluded = (nextIncluded: string[], nextExcluded = excluded, nextMatchAll = matchAll) => {
    onApply({
      type: 'multiSelect',
      id: definition.id,
      included: nextIncluded,
      excluded: nextExcluded,
      ...(showMatchMode ? { matchAll: nextMatchAll } : {}),
    });
  };

  const toggleOption = (optionId: string) => {
    if (included.includes(optionId)) {
      commitIncluded(included.filter((id) => id !== optionId), excluded.filter((id) => id !== optionId));
      return;
    }
    if (excluded.includes(optionId)) {
      commitIncluded(included, excluded.filter((id) => id !== optionId));
      return;
    }
    commitIncluded([optionId, ...included], excluded);
  };

  if (variant === 'pills') {
    return (
      <View style={[styles.pillGrid, compact && styles.pillGridCompact]}>
        {definition.options.map((option) => {
          const selected = included.includes(option.id);
          if (selected) {
            return (
              <Pressable
                key={option.id}
                style={[styles.sortPillActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}
                onPress={() => toggleOption(option.id)}>
                <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
                  {option.label}
                </ThemedText>
              </Pressable>
            );
          }

          return (
            <GlassSurface key={option.id} borderRadius={radius.pill} interactive>
              <Pressable style={styles.sortPill} onPress={() => toggleOption(option.id)}>
                <ThemedText variant='subheadline' numberOfLines={1}>
                  {option.label}
                </ThemedText>
              </Pressable>
            </GlassSurface>
          );
        })}
      </View>
    );
  }

  if (variant === 'checkbox') {
    const useGrid = columns > 1;

    return (
      <View style={[styles.optionList, compact && styles.optionListCompact, useGrid && styles.checkboxGrid]}>
        {definition.options.map((option) => {
          const selected = included.includes(option.id);
          return (
            <Pressable
              key={option.id}
              style={[
                styles.checkboxRow,
                useGrid && styles.checkboxGridItem,
                selected && { backgroundColor: colors.secondaryFill, borderRadius: radius.sm },
              ]}
              onPress={() => toggleOption(option.id)}>
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={22}
                color={selected ? colors.tint : colors.tertiaryLabel}
              />
              <ThemedText variant='body' numberOfLines={1}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={compact ? styles.dropdown : styles.genreModalSection}>
      {showMatchMode ? (
        <MatchModeToggle matchAll={matchAll} onChange={(next) => commitIncluded(included, excluded, next)} />
      ) : null}

      <GlassSurface borderRadius={radius.sm} style={styles.genreSearchWrap} interactive>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={definition.title}
          placeholderTextColor={colors.tertiaryLabel}
          style={[styles.genreSearch, { color: colors.label }]}
          clearButtonMode='while-editing'
        />
      </GlassSurface>

      {selectedOptions.length > 0 ? (
        <View style={styles.selectedSection}>
          <ThemedText variant='footnote' color='secondaryLabel'>
            {t('source_search_filters_selected')}
          </ThemedText>
          <View style={styles.tagGrid}>
            {selectedOptions.map((option) => (
              <Pressable
                key={`selected-${option.id}`}
                style={[styles.tag, styles.tagSelected, { borderRadius: radius.pill, backgroundColor: colors.tint }]}
                onPress={() => toggleOption(option.id)}>
                <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.tagGrid}>
        {unselectedOptions.map((option) => (
          <GlassSurface key={option.id} borderRadius={radius.pill} interactive>
            <Pressable style={styles.tag} onPress={() => toggleOption(option.id)}>
              <ThemedText variant='subheadline' numberOfLines={1}>
                {option.label}
              </ThemedText>
            </Pressable>
          </GlassSurface>
        ))}
      </View>
    </View>
  );
}

function TextOptions({
  definition,
  values,
  onApply,
  compact,
}: {
  definition: Extract<FilterDefinition, { type: 'text' }>;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  compact?: boolean;
}) {
  const { colors, radius } = useTheme();
  const value =
    values.find((entry): entry is Extract<FilterValue, { type: 'text' }> => entry.id === definition.id && entry.type === 'text')
      ?.value ?? '';

  return (
    <View style={compact ? styles.dropdown : undefined}>
      <TextInput
        value={value}
        onChangeText={(text) => onApply({ type: 'text', id: definition.id, value: text })}
        placeholder={definition.placeholder ?? definition.title}
        placeholderTextColor={colors.tertiaryLabel}
        style={[styles.textInput, { color: colors.label, backgroundColor: colors.secondaryFill, borderRadius: radius.sm }]}
      />
    </View>
  );
}

function CheckOptions({
  definition,
  values,
  onApply,
  compact,
}: {
  definition: Extract<FilterDefinition, { type: 'check' }>;
  values: FilterValue[];
  onApply: (next: FilterValue) => void;
  compact?: boolean;
}) {
  const { colors, radius } = useTheme();
  const checked =
    values.find((entry): entry is Extract<FilterValue, { type: 'check' }> => entry.id === definition.id && entry.type === 'check')
      ?.value ?? definition.default ?? false;

  return (
    <View style={compact ? styles.dropdown : styles.optionList}>
      <Pressable
        style={[styles.checkboxRow, checked && { backgroundColor: colors.secondaryFill, borderRadius: radius.sm }]}
        onPress={() => onApply({ type: 'check', id: definition.id, value: !checked })}>
        <Ionicons
          name={checked ? 'checkbox' : 'square-outline'}
          size={22}
          color={checked ? colors.tint : colors.tertiaryLabel}
        />
        <ThemedText variant='body'>{definition.title}</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  iconChip: {
    flexShrink: 0,
  },
  iconChipPressable: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    maxWidth: 180,
  },
  chipPressable: {
    height: 32,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  chipActive: {
    height: 32,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    maxWidth: 180,
  },
  dropdown: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    gap: Spacing.sm,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  checkboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  checkboxGridItem: {
    width: '50%',
  },
  genreModalSection: {
    gap: Spacing.sm,
  },
  genreSearchWrap: {
    width: '100%',
  },
  genreSearch: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
    minHeight: 44,
  },
  selectedSection: {
    gap: Spacing.xs,
  },
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  tag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  tagSelected: {
    maxWidth: '100%',
  },
  textInput: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 44,
    fontSize: 16,
  },
  modal: {
    flex: 1,
  },
  modalAvoiding: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  modalTitle: {
    flex: 1,
    textAlign: 'center',
  },
  modalHeaderButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minWidth: 96,
    alignItems: 'center',
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  modalSectionCard: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalFooter: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerButton: {
    width: '100%',
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  pillGridCompact: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
});
