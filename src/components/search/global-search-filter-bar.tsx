import { Modal } from "@/hooks/use-duo-layout";
import { MODAL_HEADER_HEIGHT, ModalHeader } from '@/components/ui/modal-header';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Card, CardSeparator } from '@/components/ui/card';
import { GlassSurface } from '@/components/ui/glass-surface';
import { NativeChipMenu, NATIVE_MENU_MAX_OPTIONS } from '@/components/sources/native-filter-menu';
import { SwipeDismissSheet } from '@/components/ui/swipe-dismiss-sheet';
import { OptionSegmentedControl } from '@/components/ui/option-segmented-control';
import { SectionFooter } from '@/components/ui/section-footer';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';
import type { InstalledSource } from '@/parsers/shared/types';
import { sourceRouteId } from '@/services/sources';
import { languageWithFlag } from '@/utils/language-flag';

export type GlobalSearchContentFilter = 'all' | 'safe' | 'nsfw';

export type GlobalSearchFilters = {
  sourceRouteIds: string[];
  languages: string[];
  contentFilter: GlobalSearchContentFilter;
  includeNsfwSources: boolean;
};

export const DEFAULT_GLOBAL_SEARCH_FILTERS: GlobalSearchFilters = {
  sourceRouteIds: [],
  languages: [],
  contentFilter: 'all',
  includeNsfwSources: false,
};

type GlobalSearchFilterBarProps = {
  installed: InstalledSource[];
  filters: GlobalSearchFilters;
  onChange: (filters: GlobalSearchFilters) => void;
  /** Opens the full filter modal; the bar shows its own button for it unless `hideFiltersButton` is set. */
  onOpenFilters: () => void;
  hideFiltersButton?: boolean;
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
  if (filters.languages.length === 1) return languageWithFlag(filters.languages[0]!);
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
  let sources = filters.includeNsfwSources
    ? installed
    : installed.filter((source) => (source.manifest.info.contentRating ?? 0) < 3);

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
        <ThemedText variant='callout' color='onTint' numberOfLines={1}>
          {label}
        </ThemedText>
        <Ionicons name='chevron-down' size={15} color={colors.onTint} />
      </Pressable>
    );
  }

  return (
    <GlassSurface glassStyle='regular' borderRadius={radius.pill} style={styles.chip}>
      <Pressable style={styles.chipPressable} onPress={onPress} accessibilityRole='button'>
        <ThemedText variant='callout' numberOfLines={1}>
          {label}
        </ThemedText>
        <Ionicons name='chevron-down' size={15} color={colors.tertiaryLabel} />
      </Pressable>
    </GlassSurface>
  );
}

function ToggleChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  const content = (
    <>
      <Ionicons
        name={active ? 'eye' : 'eye-off-outline'}
        size={17}
        color={active ? colors.onTint : colors.tertiaryLabel}
      />
      <ThemedText variant='callout' color={active ? 'onTint' : 'label'} numberOfLines={1}>
        {label}
      </ThemedText>
    </>
  );

  if (active) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole='switch'
        accessibilityState={{ checked: true }}
        style={[styles.chipActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}>
        {content}
      </Pressable>
    );
  }

  return (
    <GlassSurface glassStyle='regular' borderRadius={radius.pill} style={styles.chip}>
      <Pressable
        style={styles.chipPressable}
        onPress={onPress}
        accessibilityRole='switch'
        accessibilityState={{ checked: false }}>
        {content}
      </Pressable>
    </GlassSurface>
  );
}

/** Multi-select list in the Settings style: a row per option with a trailing checkmark. */
function normalizeIconUri(uri: string): string {
  if (/^https?:\/\//i.test(uri)) return uri;
  if (uri.startsWith('file://')) return uri;
  if (uri.startsWith('/')) return `file://${uri}`;
  return uri;
}

function CheckList({
  options,
  selected,
  onToggle,
}: {
  options: Array<{ id: string; label: string; iconUri?: string; initial?: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View>
      {options.map((option, index) => {
        const isSelected = selected.includes(option.id);
        return (
          <Fragment key={option.id}>
            {index > 0 ? <CardSeparator /> : null}
            <Pressable
              onPress={() => onToggle(option.id)}
              accessibilityRole='checkbox'
              accessibilityState={{ checked: isSelected }}
              style={({ pressed }) => [styles.checkRow, pressed && { backgroundColor: colors.quaternaryFill }]}>
              {option.initial !== undefined ? (
                <View style={[styles.sourceIcon, { backgroundColor: colors.quaternaryFill }]}>
                  {option.iconUri ? (
                    <Image
                      source={{ uri: normalizeIconUri(option.iconUri) }}
                      style={styles.sourceIconImage}
                      contentFit='cover'
                      transition={150}
                    />
                  ) : (
                    <ThemedText variant='caption1'>{option.initial}</ThemedText>
                  )}
                </View>
              ) : null}
              <ThemedText variant='body' style={styles.switchLabel} numberOfLines={1}>
                {option.label}
              </ThemedText>
              {isSelected ? <Ionicons name='checkmark' size={20} color={colors.tint} /> : null}
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

/** Floating glass card under the chip row with a checkmark list (shown when the native menu is not used). */
function OptionsPanel({
  options,
  selected,
  onToggle,
}: {
  options: Array<{ id: string; label: string; iconUri?: string; initial?: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const { isDark } = useTheme();
  const { height } = useWindowDimensions();
  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      style={[styles.panel, { shadowOpacity: isDark ? 0.5 : 0.18 }]}>
      <GlassSurface glassStyle='regular' borderRadius={20}>
        <ScrollView
          style={[styles.panelScroll, { maxHeight: height * 0.5 }]}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled>
          <CheckList options={options} selected={selected} onToggle={onToggle} />
        </ScrollView>
      </GlassSurface>
    </Animated.View>
  );
}

function ModalHeaderButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const { radius } = useTheme();

  return (
    <GlassSurface glassStyle='regular' borderRadius={radius.pill}>
      <Pressable style={styles.modalHeaderButton} onPress={onPress} accessibilityRole='button' accessibilityLabel={label}>
        <ThemedText variant='headline' color={primary ? 'tint' : 'label'}>
          {label}
        </ThemedText>
      </Pressable>
    </GlassSurface>
  );
}

export function GlobalSearchFilterModal({
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
  const { height: windowHeight } = useWindowDimensions();
  const [draft, setDraft] = useState(filters);
  const languages = useMemo(() => collectLanguages(installed), [installed]);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const sourceOptions = useMemo(
    () => installed.map((source) => ({
      id: sourceRouteId(source),
      label: source.manifest.info.name,
      iconUri: source.iconUri,
      initial: source.manifest.info.name.slice(0, 1),
    })),
    [installed],
  );

  const languageOptions = useMemo(
    () => languages.map((language) => ({ id: language, label: languageWithFlag(language) })),
    [languages],
  );

  const contentOptions: Array<{ id: GlobalSearchContentFilter; label: string }> = [
    { id: 'all', label: contentLabel('all') },
    { id: 'safe', label: contentLabel('safe') },
    { id: 'nsfw', label: contentLabel('nsfw') },
  ];

  return (
    <Modal visible={visible} animationType='none' transparent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(250)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <SwipeDismissSheet
        onClose={onClose}
        style={[
          styles.sheet,
          { backgroundColor: colors.systemBackground, maxHeight: Math.round(windowHeight * 0.9) },
        ]}>
        <ModalHeader
          title={t('source_search_filters')}
          closeLabel={t('cancel')}
          onClose={onClose}
          actionLabel={t('source_search_filters_apply')}
          onAction={() => {
            onChange(draft);
            onClose();
          }}
        />

        <ScrollView
          style={styles.modalScrollFit}
          contentContainerStyle={[styles.modalContent, { paddingTop: MODAL_HEADER_HEIGHT + Spacing.md, paddingBottom: Spacing.xxxl }]}
          scrollIndicatorInsets={{ top: MODAL_HEADER_HEIGHT }}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}>
          <SectionLabel isFirst>{t('settings_sources_nsfw')}</SectionLabel>
          <OptionSegmentedControl
            options={contentOptions}
            selectedId={draft.contentFilter}
            onSelect={(id) =>
              setDraft((current) => ({ ...current, contentFilter: id as GlobalSearchContentFilter }))
            }
          />

          <Card style={styles.switchCard}>
            <View style={styles.switchRow}>
              <ThemedText variant='body' style={styles.switchLabel}>
                {t('search_filter_include_nsfw')}
              </ThemedText>
              <Switch
                accessibilityLabel={t('search_filter_include_nsfw')}
                value={draft.includeNsfwSources}
                onValueChange={(includeNsfwSources) => setDraft((current) => ({ ...current, includeNsfwSources }))}
              />
            </View>
          </Card>

          <SectionLabel>{t('search_filter_sources')}</SectionLabel>
          <Card>
            <CheckList
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
          <SectionFooter>{t('search_filter_sources_hint')}</SectionFooter>

          <SectionLabel>{t('search_filter_languages')}</SectionLabel>
          <Card>
            <CheckList
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
          <SectionFooter>{t('search_filter_languages_hint')}</SectionFooter>

          <View style={styles.resetWrap}>
            <Card style={styles.switchCard}>
              <Pressable
                onPress={() => setDraft(DEFAULT_GLOBAL_SEARCH_FILTERS)}
                accessibilityRole='button'
                style={styles.resetRow}>
                <ThemedText variant='body' color='destructive'>
                  {t('source_search_filters_reset')}
                </ThemedText>
              </Pressable>
            </Card>
          </View>
        </ScrollView>
      </SwipeDismissSheet>
    </Modal>
  );
}

export function GlobalSearchFilterBar({
  installed,
  filters,
  onChange,
  onOpenFilters,
  hideFiltersButton = false,
}: GlobalSearchFilterBarProps) {
  const { colors, isDark } = useTheme();
  const [openFilterId, setOpenFilterId] = useState<OpenFilterId>(null);
  const languages = useMemo(() => collectLanguages(installed), [installed]);

  const sourceOptions = useMemo(
    () => installed.map((source) => ({
      id: sourceRouteId(source),
      label: source.manifest.info.name,
      iconUri: source.iconUri,
      initial: source.manifest.info.name.slice(0, 1),
    })),
    [installed],
  );

  const languageOptions = useMemo(
    () => languages.map((language) => ({ id: language, label: languageWithFlag(language) })),
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
    onOpenFilters();
  };

  return (
    <>
      <View style={styles.bar}>
        {openFilterId !== null ? (
          <View
            style={[styles.dim, { backgroundColor: "transparent" }]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setOpenFilterId(null)}
              accessibilityRole='button'
              accessibilityLabel={t('cancel')}
            />
          </View>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.row}
          keyboardShouldPersistTaps='handled'>
          {hideFiltersButton ? null : (
          <GlassSurface glassStyle='regular' borderRadius={999} style={styles.iconChip}>
            <Pressable
              style={styles.iconChipPressable}
              onPress={openModal}
              accessibilityRole='button'
              accessibilityLabel={t('source_search_filters')}>
              <Ionicons name='options-outline' size={20} color={colors.label} />
            </Pressable>
          </GlassSurface>
          )}

          <ToggleChip
            label={t('search_filter_nsfw_sources')}
            active={filters.includeNsfwSources}
            onPress={() => onChange({ ...filters, includeNsfwSources: !filters.includeNsfwSources })}
          />
          {Platform.OS === 'ios' && sourceOptions.length <= NATIVE_MENU_MAX_OPTIONS ? (
            <NativeChipMenu
              label={sourcesLabel(filters, installed)}
              options={sourceOptions}
              multiple
              selected={filters.sourceRouteIds}
              onChange={(sourceRouteIds) => onChange({ ...filters, sourceRouteIds })}
            />
          ) : (
            <FilterChip
              label={sourcesLabel(filters, installed)}
              active={openFilterId === 'sources'}
              onPress={() => toggleFilter('sources')}
            />
          )}
          {Platform.OS === 'ios' && languageOptions.length <= NATIVE_MENU_MAX_OPTIONS ? (
            <NativeChipMenu
              label={languagesLabel(filters)}
              options={languageOptions}
              multiple
              selected={filters.languages}
              onChange={(languages) => onChange({ ...filters, languages })}
            />
          ) : (
            <FilterChip
              label={languagesLabel(filters)}
              active={openFilterId === 'languages'}
              onPress={() => toggleFilter('languages')}
            />
          )}
          {Platform.OS === 'ios' ? (
            <NativeChipMenu
              label={contentLabel(filters.contentFilter)}
              options={contentOptions}
              multiple={false}
              selected={[filters.contentFilter]}
              onChange={([contentFilter]) =>
                onChange({ ...filters, contentFilter: (contentFilter ?? 'all') as GlobalSearchContentFilter })
              }
            />
          ) : (
            <FilterChip
              label={contentLabel(filters.contentFilter)}
              active={openFilterId === 'content'}
              onPress={() => toggleFilter('content')}
            />
          )}
        </ScrollView>

        {openFilterId === 'sources' ? (
          <OptionsPanel
            options={sourceOptions}
            selected={filters.sourceRouteIds}
            onToggle={(id) => onChange({ ...filters, sourceRouteIds: toggleValue(filters.sourceRouteIds, id) })}
          />
        ) : null}

        {openFilterId === 'languages' ? (
          <OptionsPanel
            options={languageOptions}
            selected={filters.languages}
            onToggle={(id) => onChange({ ...filters, languages: toggleValue(filters.languages, id) })}
          />
        ) : null}

        {openFilterId === 'content' ? (
          <OptionsPanel
            options={contentOptions}
            selected={[filters.contentFilter]}
            onToggle={(id) => onChange({ ...filters, contentFilter: id as GlobalSearchContentFilter })}
          />
        ) : null}
      </View>
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
  // Extends far below the bar so it dims the results list behind the open dropdown.
  dim: {
    position: 'absolute',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  iconChip: {
    flexShrink: 0,
  },
  iconChipPressable: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    maxWidth: 220,
    flexShrink: 0,
  },
  chipPressable: {
    height: 40,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  chipActive: {
    height: 40,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    maxWidth: 220,
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  // Sized to the content up to the sheet's maximum height, then scrolls.
  modalScrollFit: {
    flexGrow: 0,
    flexShrink: 1,
  },
  panel: {
    marginHorizontal: Spacing.lg,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 8,
  },
  panelScroll: {
    borderRadius: 20,
    overflow: 'hidden',
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
  switchCard: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  resetWrap: {
    marginTop: Spacing.lg,
  },
  resetRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  sourceIcon: {
    width: 30,
    height: 30,
    borderRadius: 7,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceIconImage: {
    width: 30,
    height: 30,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: 48,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  switchLabel: {
    flex: 1,
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
