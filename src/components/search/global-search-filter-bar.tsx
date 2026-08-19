import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/card';
import { GlassDestructiveButton } from '@/components/ui/glass-destructive-button';
import { GlassSurface } from '@/components/ui/glass-surface';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';
import type { InstalledSource } from '@/parsers/shared/types';
import { sourceRouteId } from '@/services/sources';

export type GlobalSearchContentFilter = 'all' | 'safe' | 'nsfw';

export type GlobalSearchFilters = {
  sourceRouteIds: string[];
  languages: string[];
  contentFilter: GlobalSearchContentFilter;
};

export const DEFAULT_GLOBAL_SEARCH_FILTERS: GlobalSearchFilters = {
  sourceRouteIds: [],
  languages: [],
  contentFilter: 'all',
};

type GlobalSearchFilterBarProps = {
  installed: InstalledSource[];
  filters: GlobalSearchFilters;
  onChange: (filters: GlobalSearchFilters) => void;
};

type OpenFilterId = 'sources' | 'languages' | 'content' | null;

function collectLanguages(sources: InstalledSource[]): string[] {
  const languages = new Set<string>();
  for (const source of sources) {
    for (const language of source.manifest.info.languages) {
      languages.add(language);
    }
  }
  return [...languages].sort((a, b) => a.localeCompare(b));
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function sourcesLabel(filters: GlobalSearchFilters, installed: InstalledSource[]): string {
  if (filters.sourceRouteIds.length === 0) return t('search_filter_sources_all');
  if (filters.sourceRouteIds.length === 1) {
    const source = installed.find((entry) => sourceRouteId(entry) === filters.sourceRouteIds[0]);
    return source?.manifest.info.name ?? t('search_filter_sources');
  }
  return t('search_filter_sources_count', { count: String(filters.sourceRouteIds.length) });
}

function languagesLabel(filters: GlobalSearchFilters): string {
  if (filters.languages.length === 0) return t('search_filter_languages_all');
  if (filters.languages.length === 1) return filters.languages[0]!;
  return t('search_filter_languages_count', { count: String(filters.languages.length) });
}

function contentLabel(filter: GlobalSearchContentFilter): string {
  switch (filter) {
    case 'safe':
      return t('search_filter_content_safe');
    case 'nsfw':
      return t('search_filter_content_nsfw');
    default:
      return t('search_filter_content_all');
  }
}

export function filterInstalledForSearch(
  installed: InstalledSource[],
  filters: GlobalSearchFilters,
): InstalledSource[] {
  let sources = installed;

  if (filters.sourceRouteIds.length > 0) {
    const selected = new Set(filters.sourceRouteIds);
    sources = sources.filter((source) => selected.has(sourceRouteId(source)));
  }

  if (filters.languages.length > 0) {
    const selected = new Set(filters.languages);
    sources = sources.filter((source) =>
      source.manifest.info.languages.some((language) => selected.has(language)),
    );
  }

  return sources;
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

function PillOptions<T extends string>({
  options,
  selected,
  onToggle,
  single = false,
  inline = false,
}: {
  options: Array<{ id: T; label: string }>;
  selected: T | T[];
  onToggle: (id: T) => void;
  single?: boolean;
  inline?: boolean;
}) {
  const { colors, radius } = useTheme();
  const selectedSet = single
    ? new Set([selected as T])
    : new Set(Array.isArray(selected) ? selected : []);

  return (
    <View style={inline ? undefined : styles.dropdown}>
      <View style={styles.pillGrid}>
        {options.map((option) => {
          const isSelected = selectedSet.has(option.id);
          if (isSelected) {
            return (
              <Pressable
                key={option.id}
                style={[styles.sortPillActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}
                onPress={() => onToggle(option.id)}>
                <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
                  {option.label}
                </ThemedText>
              </Pressable>
            );
          }

          return (
            <GlassSurface key={option.id} borderRadius={radius.pill} interactive>
              <Pressable style={styles.sortPill} onPress={() => onToggle(option.id)}>
                <ThemedText variant='subheadline' numberOfLines={1}>
                  {option.label}
                </ThemedText>
              </Pressable>
            </GlassSurface>
          );
        })}
      </View>
    </View>
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

function GlobalSearchFilterModal({
  visible,
  installed,
  filters,
  onChange,
  onClose,
}: {
  visible: boolean;
  installed: InstalledSource[];
  filters: GlobalSearchFilters;
  onChange: (filters: GlobalSearchFilters) => void;
  onClose: () => void;
}) {
  const { colors, radius } = useTheme();
  const [draft, setDraft] = useState(filters);
  const languages = useMemo(() => collectLanguages(installed), [installed]);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const sourceOptions = useMemo(
    () => installed.map((source) => ({ id: sourceRouteId(source), label: source.manifest.info.name })),
    [installed],
  );

  const languageOptions = useMemo(
    () => languages.map((language) => ({ id: language, label: language })),
    [languages],
  );

  const contentOptions: Array<{ id: GlobalSearchContentFilter; label: string }> = [
    { id: 'all', label: contentLabel('all') },
    { id: 'safe', label: contentLabel('safe') },
    { id: 'nsfw', label: contentLabel('nsfw') },
  ];

  return (
    <Modal visible={visible} animationType='slide' presentationStyle='pageSheet' onRequestClose={onClose}>
      <View style={[styles.modalRoot, { backgroundColor: colors.systemBackground, paddingTop: Spacing.sm }]}>
        <View style={styles.modalHeader}>
          <ModalHeaderButton label={t('cancel')} onPress={onClose} />
          <ThemedText variant='headline' style={styles.modalTitle}>
            {t('source_search_filters')}
          </ThemedText>
          <ModalHeaderButton
            label={t('source_search_filters_apply')}
            onPress={() => {
              onChange(draft);
              onClose();
            }}
            primary
          />
        </View>

        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={[styles.modalContent, { paddingBottom: Spacing.xxxl }]}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}>
          <SectionLabel isFirst>{t('search_filter_sources')}</SectionLabel>
          <Card style={styles.modalSectionCard}>
            <ThemedText variant='footnote' color='secondaryLabel'>
              {t('search_filter_sources_hint')}
            </ThemedText>
            <PillOptions
              inline
              options={sourceOptions}
              selected={draft.sourceRouteIds}
              onToggle={(id) =>
                setDraft((current) => ({
                  ...current,
                  sourceRouteIds: toggleValue(current.sourceRouteIds, id),
                }))
              }
            />
          </Card>

          <SectionLabel>{t('search_filter_languages')}</SectionLabel>
          <Card style={styles.modalSectionCard}>
            <ThemedText variant='footnote' color='secondaryLabel'>
              {t('search_filter_languages_hint')}
            </ThemedText>
            <PillOptions
              inline
              options={languageOptions}
              selected={draft.languages}
              onToggle={(id) =>
                setDraft((current) => ({
                  ...current,
                  languages: toggleValue(current.languages, id),
                }))
              }
            />
          </Card>

          <SectionLabel>{t('settings_sources_nsfw')}</SectionLabel>
          <Card style={styles.modalSectionCard}>
            <PillOptions
              inline
              options={contentOptions}
              selected={draft.contentFilter}
              single
              onToggle={(id) => setDraft((current) => ({ ...current, contentFilter: id }))}
            />
          </Card>
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={[styles.modalFooter, { borderTopColor: colors.separator }]}>
          <GlassDestructiveButton
            label={t('source_search_filters_reset')}
            onPress={() => setDraft(DEFAULT_GLOBAL_SEARCH_FILTERS)}
            style={styles.footerButton}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function GlobalSearchFilterBar({ installed, filters, onChange }: GlobalSearchFilterBarProps) {
  const { colors } = useTheme();
  const [openFilterId, setOpenFilterId] = useState<OpenFilterId>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const languages = useMemo(() => collectLanguages(installed), [installed]);

  const sourceOptions = useMemo(
    () => installed.map((source) => ({ id: sourceRouteId(source), label: source.manifest.info.name })),
    [installed],
  );

  const languageOptions = useMemo(
    () => languages.map((language) => ({ id: language, label: language })),
    [languages],
  );

  const contentOptions: Array<{ id: GlobalSearchContentFilter; label: string }> = [
    { id: 'all', label: contentLabel('all') },
    { id: 'safe', label: contentLabel('safe') },
    { id: 'nsfw', label: contentLabel('nsfw') },
  ];

  const toggleFilter = (id: OpenFilterId) => {
    setOpenFilterId((current) => (current === id ? null : id));
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

          <FilterChip
            label={sourcesLabel(filters, installed)}
            active={openFilterId === 'sources'}
            onPress={() => toggleFilter('sources')}
          />
          <FilterChip
            label={languagesLabel(filters)}
            active={openFilterId === 'languages'}
            onPress={() => toggleFilter('languages')}
          />
          <FilterChip
            label={contentLabel(filters.contentFilter)}
            active={openFilterId === 'content'}
            onPress={() => toggleFilter('content')}
          />
        </ScrollView>

        {openFilterId === 'sources' ? (
          <PillOptions
            options={sourceOptions}
            selected={filters.sourceRouteIds}
            onToggle={(id) => onChange({ ...filters, sourceRouteIds: toggleValue(filters.sourceRouteIds, id) })}
          />
        ) : null}

        {openFilterId === 'languages' ? (
          <PillOptions
            options={languageOptions}
            selected={filters.languages}
            onToggle={(id) => onChange({ ...filters, languages: toggleValue(filters.languages, id) })}
          />
        ) : null}

        {openFilterId === 'content' ? (
          <PillOptions
            options={contentOptions}
            selected={filters.contentFilter}
            single
            onToggle={(contentFilter) => onChange({ ...filters, contentFilter })}
          />
        ) : null}
      </View>

      <GlobalSearchFilterModal
        visible={modalOpen}
        installed={installed}
        filters={filters}
        onChange={onChange}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexGrow: 0,
    flexShrink: 0,
    gap: Spacing.sm,
    alignSelf: 'stretch',
    paddingTop: Spacing.xs,
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
    flexShrink: 0,
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
    flexShrink: 0,
  },
  dropdown: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  sortPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sortPillActive: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  modalRoot: {
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
  modalScroll: {
    flex: 1,
  },
  modalHeaderButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minWidth: 96,
    alignItems: 'center',
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
});
