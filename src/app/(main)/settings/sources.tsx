import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Keyboard,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { SourceFilterBar, type SourceKindFilter } from '@/components/sources/source-filter-bar';
import { SourceListItem, installedSourceSubtitle, registryEntrySubtitle } from '@/components/sources/source-list-item';
import { SwipeableRow, SwipeableRowsProvider, type SwipeAction } from '@/components/sources/swipeable-row';
import { Card, CardSeparator } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LiquidGlassScrollComponent } from '@/components/ui/liquid-glass-scroll-root';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useSources } from '@/context/sources-context';
import { useTheme } from '@/hooks/use-theme';
import type { InstalledSource, RegistryEntry } from '@/parsers/shared/types';
import {
  collectAvailableLanguages,
  filterCatalogEntries,
  hasBothCatalogKinds,
  type CatalogSourceEntry,
} from '@/services/registry-catalog';
import { resolveRegistryIconUrl } from '@/services/sources';
import {
  claimRegistryDeepLink,
  consumePendingRegistryDeepLink,
  finishRegistryDeepLinkPrompt,
  parseRegistryFromRouteParam,
  subscribePendingRegistryDeepLink,
} from '@/utils/registry-deep-link';
import { isDuplicateRegistryUrl } from '@/utils/registry-url';
import { createRegistryListItem, resolveRegistryDisplayName, resolveRegistryIconSource } from '@/utils/registry-display';
import { isSearchActive, matchesCatalogEntry } from '@/utils/source-search';

const AVAILABLE_PAGE_SIZE = 24;
const PRESS_SPRING = { damping: 14, stiffness: 320, mass: 0.6 };

type ListRow =
  | { type: 'installed'; key: string; source: InstalledSource; index: number; total: number }
  | { type: 'controls'; key: 'controls' }
  | { type: 'available'; key: string; item: CatalogSourceEntry; index: number; total: number }
  | {
      type: 'available-status';
      key: 'status';
      kind: 'loading' | 'empty-catalog' | 'empty-search' | 'all-installed' | 'no-registries';
    }
  | { type: 'load-more'; key: 'load-more'; remaining: number };

export default function SettingsSourcesScreen() {
  const router = useRouter();
  const { registry: registryParam } = useLocalSearchParams<{ registry?: string | string[] }>();
  const { colors, radius } = useTheme();
  const {
    installed,
    installedIds,
    catalogEntries,
    pendingUpdates,
    registries,
    registryCatalogs,
    showNsfw,
    isLoading,
    isCatalogLoading,
    isCheckingUpdates,
    installPackage,
    installRegistryEntry,
    updateSource,
    uninstall,
    setShowNsfw,
    updateRegistries,
    getSourceUpdate,
    refreshInBackground,
  } = useSources();
  const [newRegistryUrl, setNewRegistryUrl] = useState('');
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<SourceKindFilter | null>(null);
  const [availableSearch, setAvailableSearch] = useState('');
  const [visibleAvailableCount, setVisibleAvailableCount] = useState(AVAILABLE_PAGE_SIZE);
  const [updatingSourceId, setUpdatingSourceId] = useState<string | null>(null);
  const [catalogVisible, setCatalogVisible] = useState(false);
  const deferredSearch = useDeferredValue(availableSearch);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setCatalogVisible(true);
    });
    return () => task.cancel();
  }, []);

  const catalogBase = useMemo(
    () =>
      filterCatalogEntries(catalogEntries, installedIds, {
        language: languageFilter,
        kind: kindFilter,
      }),
    [catalogEntries, installedIds, languageFilter, kindFilter],
  );

  const availableSearchActive = isSearchActive(deferredSearch);

  const showKindFilter = useMemo(
    () => hasBothCatalogKinds(catalogEntries, installedIds),
    [catalogEntries, installedIds],
  );

  const availableLanguages = useMemo(
    () => collectAvailableLanguages(catalogEntries, installedIds),
    [catalogEntries, installedIds],
  );

  useEffect(() => {
    setVisibleAvailableCount(AVAILABLE_PAGE_SIZE);
  }, [languageFilter, kindFilter, catalogEntries.length, installedIds.size, deferredSearch]);

  const filteredAvailableEntries = useMemo(
    () => catalogBase.filter((item) => matchesCatalogEntry(item.entry, deferredSearch)),
    [catalogBase, deferredSearch],
  );

  const visibleAvailableEntries = useMemo(
    () =>
      availableSearchActive
        ? filteredAvailableEntries
        : filteredAvailableEntries.slice(0, visibleAvailableCount),
    [filteredAvailableEntries, availableSearchActive, visibleAvailableCount],
  );

  const notInstalledCount = useMemo(
    () => catalogEntries.filter((item) => !installedIds.has(item.entry.id)).length,
    [catalogEntries, installedIds],
  );

  const updateSourceIds = useMemo(() => new Set(pendingUpdates.map((update) => update.sourceId)), [pendingUpdates]);

  const installedWithoutPendingUpdates = useMemo(
    () => installed.filter((source) => !updateSourceIds.has(source.id)),
    [installed, updateSourceIds],
  );

  const confirmRemoveRegistry = useCallback(
    (item: { url: string; name?: string }) => {
      const label = resolveRegistryDisplayName(item, registryCatalogs[item.url]);
      Alert.alert(t('settings_sources_remove_registry_title'), t('settings_sources_remove_registry_confirm', { name: label }), [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('settings_sources_remove_registry_action'),
          style: 'destructive',
          onPress: () => void updateRegistries(registries.filter((entry) => entry.url !== item.url)),
        },
      ]);
    },
    [registries, registryCatalogs, updateRegistries],
  );

  const registryActions = useCallback(
    (item: { url: string; name?: string }): SwipeAction[] => [
      {
        key: 'remove',
        label: t('settings_sources_remove_registry_action'),
        icon: 'trash-outline',
        color: colors.destructive,
        onPress: () => confirmRemoveRegistry(item),
      },
    ],
    [colors.destructive, confirmRemoveRegistry],
  );

  const openSourceSettings = useCallback(
    (source: InstalledSource) => {
      router.push(`/settings/source/${encodeURIComponent(source.id)}`);
    },
    [router],
  );

  const pickPackage = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const response = await fetch(asset.uri);
    const data = new Uint8Array(await response.arrayBuffer());
    try {
      await installPackage(data, asset.name ?? 'package.tamdok');
    } catch (error) {
      Alert.alert(t('sources_install_failed'), error instanceof Error ? error.message : String(error));
    }
  }, [installPackage]);

  const validateRegistryUrl = useCallback(
    (url: string): 'invalid' | 'duplicate' | 'ok' => {
      try {
        new URL(url);
      } catch {
        return 'invalid';
      }

      if (isDuplicateRegistryUrl(url, registries.map((item) => item.url))) {
        return 'duplicate';
      }

      return 'ok';
    },
    [registries],
  );

  const addRegistry = useCallback(
    async (url: string) => {
      const trimmed = url.trim();
      if (!trimmed) return;

      const validation = validateRegistryUrl(trimmed);
      if (validation === 'invalid') {
        Alert.alert(t('settings_sources_registry_invalid'));
        return;
      }
      if (validation === 'duplicate') {
        Alert.alert(t('settings_sources_registry_exists'));
        return;
      }

      await updateRegistries([...registries, createRegistryListItem(trimmed)]);
      setNewRegistryUrl('');
    },
    [registries, updateRegistries, validateRegistryUrl],
  );

  const confirmAddRegistryFromDeepLink = useCallback(
    (url: string) => {
      const trimmed = url.trim();
      if (!trimmed || !claimRegistryDeepLink(trimmed)) return;

      const validation = validateRegistryUrl(trimmed);
      if (validation === 'invalid') {
        Alert.alert(
          t('settings_sources_registry_invalid'),
          undefined,
          [{ text: t('done'), onPress: finishRegistryDeepLinkPrompt }],
          { onDismiss: finishRegistryDeepLinkPrompt },
        );
        return;
      }
      if (validation === 'duplicate') {
        Alert.alert(
          t('settings_sources_registry_exists'),
          undefined,
          [{ text: t('done'), onPress: finishRegistryDeepLinkPrompt }],
          { onDismiss: finishRegistryDeepLinkPrompt },
        );
        return;
      }

      Alert.alert(
        t('settings_sources_registry_add_title'),
        resolveRegistryDisplayName({ url: trimmed }),
        [
          { text: t('cancel'), style: 'cancel', onPress: finishRegistryDeepLinkPrompt },
          {
            text: t('add'),
            onPress: () => {
              finishRegistryDeepLinkPrompt();
              void addRegistry(trimmed);
            },
          },
        ],
        { onDismiss: finishRegistryDeepLinkPrompt },
      );
    },
    [addRegistry, validateRegistryUrl],
  );

  const confirmAddRegistryFromDeepLinkRef = useRef(confirmAddRegistryFromDeepLink);
  confirmAddRegistryFromDeepLinkRef.current = confirmAddRegistryFromDeepLink;

  useEffect(() => {
    if (isLoading) return;

    const prompt = (url: string) => confirmAddRegistryFromDeepLinkRef.current(url);
    const rawRegistry = Array.isArray(registryParam) ? registryParam[0] : registryParam;
    const fromRoute = parseRegistryFromRouteParam(rawRegistry);

    if (fromRoute) {
      consumePendingRegistryDeepLink();
      prompt(fromRoute);
      router.setParams({ registry: undefined });
    } else {
      const pending = consumePendingRegistryDeepLink();
      if (pending) prompt(pending);
    }

    return subscribePendingRegistryDeepLink(() => {
      const pending = consumePendingRegistryDeepLink();
      if (pending) prompt(pending);
    });
  }, [isLoading, registryParam, router]);

  const submitNewRegistry = useCallback(() => {
    Keyboard.dismiss();
    void addRegistry(newRegistryUrl);
  }, [addRegistry, newRegistryUrl]);

  const installEntry = useCallback(
    async (registryUrl: string, entry: RegistryEntry) => {
      if (installedIds.has(entry.id)) return;
      try {
        await installRegistryEntry(registryUrl, entry);
      } catch (error) {
        Alert.alert(t('sources_install_failed'), error instanceof Error ? error.message : String(error));
      }
    },
    [installedIds, installRegistryEntry],
  );

  const confirmInstallEntry = useCallback(
    (registryUrl: string, entry: RegistryEntry) => {
      if (installedIds.has(entry.id)) return;
      Alert.alert(t('source_install_title'), t('source_install_confirm', { name: entry.name }), [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('source_install_action'),
          onPress: () => void installEntry(registryUrl, entry),
        },
      ]);
    },
    [installedIds, installEntry],
  );

  const confirmUninstall = useCallback(
    (source: InstalledSource) => {
      Alert.alert(
        t('sources_uninstall_title'),
        t('sources_uninstall_confirm', { name: source.manifest.info.name }),
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('sources_uninstall_action'),
            style: 'destructive',
            onPress: () => void uninstall(source),
          },
        ],
      );
    },
    [uninstall],
  );

  const applyUpdate = useCallback(
    async (sourceId: string) => {
      if (updatingSourceId) return;
      const update = getSourceUpdate(sourceId);
      if (!update) return;
      setUpdatingSourceId(sourceId);
      try {
        await updateSource(update);
      } catch (error) {
        Alert.alert(t('sources_install_failed'), error instanceof Error ? error.message : String(error));
      } finally {
        setUpdatingSourceId(null);
      }
    },
    [getSourceUpdate, updateSource, updatingSourceId],
  );

  const installedLeadingActions = useCallback(
    (source: InstalledSource): SwipeAction[] => [
      {
        key: 'settings',
        label: t('settings'),
        icon: 'settings-outline',
        color: '#8E8E93',
        onPress: () => openSourceSettings(source),
      },
    ],
    [openSourceSettings],
  );

  const installedActions = useCallback(
    (source: InstalledSource): SwipeAction[] => {
      const update = getSourceUpdate(source.id);
      const actions: SwipeAction[] = [];

      if (update) {
        actions.push({
          key: 'update',
          label: t('source_update_action'),
          icon: 'arrow-up-circle-outline',
          color: colors.tint,
          onPress: () => void applyUpdate(source.id),
        });
      }

      actions.push({
        key: 'delete',
        label: t('sources_uninstall_action'),
        icon: 'trash-outline',
        color: colors.destructive,
        onPress: () => confirmUninstall(source),
      });

      return actions;
    },
    [applyUpdate, colors.destructive, colors.tint, confirmUninstall, getSourceUpdate],
  );

  const availableActions = useCallback(
    (registryUrl: string, entry: RegistryEntry): SwipeAction[] => [
      {
        key: 'install',
        label: t('source_install_action'),
        icon: 'download-outline',
        color: '#34C759',
        onPress: () => confirmInstallEntry(registryUrl, entry),
      },
    ],
    [confirmInstallEntry],
  );

  const hasUpdatesSection = pendingUpdates.length > 0;

  const listData = useMemo<ListRow[]>(() => {
    const rows: ListRow[] = [];

    if (!isLoading) {
      installedWithoutPendingUpdates.forEach((source, index) => {
        rows.push({
          type: 'installed',
          key: `installed:${source.id}`,
          source,
          index,
          total: installedWithoutPendingUpdates.length,
        });
      });
    }

    rows.push({ type: 'controls', key: 'controls' });

    if (registries.length === 0) {
      rows.push({ type: 'available-status', key: 'status', kind: 'no-registries' });
      return rows;
    }

    if (!catalogVisible || (isCatalogLoading && catalogBase.length === 0)) {
      rows.push({ type: 'available-status', key: 'status', kind: 'loading' });
      return rows;
    }

    if (catalogBase.length === 0) {
      rows.push({
        type: 'available-status',
        key: 'status',
        kind: notInstalledCount === 0 ? 'all-installed' : 'empty-catalog',
      });
      return rows;
    }

    if (filteredAvailableEntries.length === 0) {
      rows.push({ type: 'available-status', key: 'status', kind: 'empty-search' });
      return rows;
    }

    visibleAvailableEntries.forEach((item, index) => {
      rows.push({
        type: 'available',
        key: `available:${item.registryUrl}:${item.entry.id}`,
        item,
        index,
        total: visibleAvailableEntries.length,
      });
    });

    if (!availableSearchActive && visibleAvailableCount < filteredAvailableEntries.length) {
      rows.push({
        type: 'load-more',
        key: 'load-more',
        remaining: filteredAvailableEntries.length - visibleAvailableCount,
      });
    }

    return rows;
  }, [
    availableSearchActive,
    catalogBase.length,
    catalogVisible,
    filteredAvailableEntries.length,
    installedWithoutPendingUpdates,
    isCatalogLoading,
    isLoading,
    notInstalledCount,
    registries.length,
    visibleAvailableCount,
    visibleAvailableEntries,
  ]);

  const listHeader = useMemo(
    () => (
      <View>
        {pendingUpdates.length > 0 ? (
          <>
            <SectionLabel isFirst>{t('settings_sources_updates')}</SectionLabel>
            <Card style={styles.listCard}>
              {pendingUpdates.map((update, index) => {
                const isUpdating = updatingSourceId === update.sourceId;
                return (
                  <View key={update.sourceId}>
                    <SourceListItem
                      title={update.source.manifest.info.name}
                      subtitle={installedSourceSubtitle(update.source, update.availableVersion)}
                      iconUri={update.source.iconUri}
                      updateAvailable={update.availableVersion}
                      imageTransition={0}
                      trailing={
                        isUpdating ? (
                          <ActivityIndicator color={colors.tint} />
                        ) : (
                          <Pressable
                            style={[styles.updateButton, { backgroundColor: colors.tint, borderRadius: radius.sm }]}
                            onPress={() => void applyUpdate(update.sourceId)}
                            accessibilityRole='button'>
                            <ThemedText variant='caption1' color='onTint' style={styles.updateButtonLabel}>
                              {t('source_update_action')}
                            </ThemedText>
                          </Pressable>
                        )
                      }
                    />
                    {index < pendingUpdates.length - 1 && <CardSeparator />}
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}

        <SectionLabel isFirst={!hasUpdatesSection}>{t('settings_sources_installed')}</SectionLabel>
        {isLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : installedWithoutPendingUpdates.length === 0 ? (
          <EmptyState icon='globe-outline' title={t('sources_empty_title')} description={t('sources_empty_desc')} />
        ) : null}
      </View>
    ),
    [
      applyUpdate,
      colors.tint,
      hasUpdatesSection,
      installedWithoutPendingUpdates.length,
      isLoading,
      pendingUpdates,
      radius.sm,
      updatingSourceId,
    ],
  );

  const renderItem = useCallback(
    ({ item }: { item: ListRow }) => {
      if (item.type === 'installed') {
        const update = getSourceUpdate(item.source.id);
        return (
          <GroupedCard index={item.index} total={item.total}>
            <SwipeableRow
              leadingActions={installedLeadingActions(item.source)}
              fullSwipeLeadingActionKey='settings'
              actions={installedActions(item.source)}
              fullSwipeActionKey='delete'
              onFullSwipe={() => confirmUninstall(item.source)}>
              <SourceListItem
                title={item.source.manifest.info.name}
                subtitle={installedSourceSubtitle(item.source, update?.availableVersion)}
                iconUri={item.source.iconUri}
                showChevron
                updateAvailable={update?.availableVersion}
                imageTransition={0}
                onPress={() => openSourceSettings(item.source)}
                onLongPress={() => openSourceSettings(item.source)}
              />
            </SwipeableRow>
          </GroupedCard>
        );
      }

      if (item.type === 'controls') {
        return (
          <View>
            <SectionLabel>{t('settings_sources_import')}</SectionLabel>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: colors.tint, borderRadius: radius.md }]}
              onPress={() => void pickPackage()}
              accessibilityRole='button'>
              <ThemedText variant='headline' color='onTint'>
                {t('sources_import_package')}
              </ThemedText>
            </Pressable>

            <SectionLabel>{t('settings_sources_nsfw')}</SectionLabel>
            <Card>
              <View style={styles.switchRow}>
                <ThemedText variant='body' style={styles.switchLabel}>
                  {t('settings_sources_show_nsfw')}
                </ThemedText>
                <Switch value={showNsfw} onValueChange={(value) => void setShowNsfw(value)} />
              </View>
            </Card>

            <SectionLabel
              trailing={
                <Pressable
                  onPress={() => void refreshInBackground()}
                  hitSlop={8}
                  accessibilityRole='button'
                  accessibilityLabel={t('settings_sources_refresh_registries')}
                  style={styles.registryRefreshButton}>
                  {isCheckingUpdates ? (
                    <ActivityIndicator size='small' color={colors.tint} />
                  ) : (
                    <Ionicons name='refresh' size={18} color={colors.tint} />
                  )}
                </Pressable>
              }>
              {t('settings_sources_registries')}
            </SectionLabel>
            <Card>
              {registries.length === 0 ? (
                <View style={styles.registryEmpty}>
                  <ThemedText variant='subheadline' color='secondaryLabel' style={styles.registryEmptyText}>
                    {t('settings_sources_registries_empty')}
                  </ThemedText>
                </View>
              ) : (
                registries.map((registry, index) => (
                  <View key={registry.url}>
                    <SwipeableRow
                      actions={registryActions(registry)}
                      fullSwipeActionKey='remove'
                      onFullSwipe={() => confirmRemoveRegistry(registry)}>
                      <SourceListItem
                        title={resolveRegistryDisplayName(registry, registryCatalogs[registry.url])}
                        iconSource={resolveRegistryIconSource(registry.url, registryCatalogs[registry.url])}
                        showChevron={false}
                        imageTransition={0}
                      />
                    </SwipeableRow>
                    {index < registries.length - 1 && <CardSeparator />}
                  </View>
                ))
              )}
            </Card>

            <View style={styles.addRegistryRow}>
              <TextInput
                value={newRegistryUrl}
                onChangeText={setNewRegistryUrl}
                placeholder={t('settings_sources_registry_placeholder')}
                placeholderTextColor={colors.tertiaryLabel}
                autoCapitalize='none'
                autoCorrect={false}
                keyboardType='url'
                returnKeyType='done'
                onSubmitEditing={submitNewRegistry}
                blurOnSubmit={false}
                style={[
                  styles.input,
                  {
                    color: colors.label,
                    backgroundColor: colors.secondarySystemBackground,
                    borderColor: colors.separator,
                    borderRadius: radius.md,
                  },
                ]}
              />
              <AddRegistryButton colors={colors} radius={radius} onPress={submitNewRegistry} />
            </View>

            <SectionLabel>{t('settings_sources_available')}</SectionLabel>
            {registries.length > 0 ? (
              <>
                <TextInput
                  value={availableSearch}
                  onChangeText={setAvailableSearch}
                  placeholder={t('settings_sources_search_placeholder')}
                  placeholderTextColor={colors.tertiaryLabel}
                  autoCapitalize='none'
                  autoCorrect={false}
                  clearButtonMode='while-editing'
                  style={[
                    styles.searchInput,
                    {
                      color: colors.label,
                      backgroundColor: colors.secondarySystemBackground,
                      borderColor: colors.separator,
                      borderRadius: radius.md,
                    },
                  ]}
                />
                <SourceFilterBar
                  languages={availableLanguages}
                  languageSelected={languageFilter}
                  onLanguageChange={setLanguageFilter}
                  showKindFilter={showKindFilter}
                  kindSelected={kindFilter}
                  onKindChange={setKindFilter}
                />
              </>
            ) : null}
          </View>
        );
      }

      if (item.type === 'available') {
        const { registryUrl, entry, kind } = item.item;
        return (
          <GroupedCard index={item.index} total={item.total}>
            <SwipeableRow
              actions={availableActions(registryUrl, entry)}
              fullSwipeActionKey='install'
              onFullSwipe={() => confirmInstallEntry(registryUrl, entry)}>
              <SourceListItem
                title={entry.name}
                subtitle={registryEntrySubtitle(entry)}
                iconUri={resolveRegistryIconUrl(registryUrl, entry)}
                badge={kind}
                imageTransition={0}
                onPress={() => confirmInstallEntry(registryUrl, entry)}
              />
            </SwipeableRow>
          </GroupedCard>
        );
      }

      if (item.type === 'available-status') {
        if (item.kind === 'loading') {
          return <ActivityIndicator style={styles.catalogLoading} />;
        }
        if (item.kind === 'no-registries') {
          return (
            <EmptyState
              icon='cloud-download-outline'
              title={t('settings_sources_available_empty_title')}
              description={t('settings_sources_available_empty_desc')}
            />
          );
        }
        if (item.kind === 'all-installed') {
          return (
            <EmptyState
              icon='cloud-download-outline'
              title={t('source_available_all_installed_title')}
              description={t('source_available_all_installed_desc')}
            />
          );
        }
        if (item.kind === 'empty-search') {
          return (
            <EmptyState
              icon='search-outline'
              title={t('source_search_empty_title')}
              description={t('source_search_empty_desc')}
            />
          );
        }
        return (
          <EmptyState
            icon='cloud-download-outline'
            title={t('source_filter_empty_title')}
            description={t('source_filter_empty_desc')}
          />
        );
      }

      return (
        <Pressable
          style={styles.secondaryAction}
          onPress={() => setVisibleAvailableCount((count) => count + AVAILABLE_PAGE_SIZE)}>
          <ThemedText variant='callout' color='tint'>
            {t('sources_load_more')} ({item.remaining})
          </ThemedText>
        </Pressable>
      );
    },
    [
      availableActions,
      availableLanguages,
      availableSearch,
      colors,
      confirmInstallEntry,
      confirmRemoveRegistry,
      confirmUninstall,
      getSourceUpdate,
      installedActions,
      installedLeadingActions,
      isCheckingUpdates,
      kindFilter,
      languageFilter,
      newRegistryUrl,
      openSourceSettings,
      pickPackage,
      radius,
      refreshInBackground,
      registries,
      registryActions,
      registryCatalogs,
      setShowNsfw,
      showKindFilter,
      showNsfw,
      submitNewRegistry,
    ],
  );

  return (
    <>
      <Stack.Screen options={{ title: t('section_sources') }} />
      <ThemedView color='groupedBackground' style={styles.root}>
        <SwipeableRowsProvider>
          <FlatList
            data={listData}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            ListHeaderComponent={listHeader}
            renderScrollComponent={(props) => <LiquidGlassScrollComponent {...props} />}
            contentContainerStyle={styles.content}
            contentInsetAdjustmentBehavior='automatic'
            keyboardShouldPersistTaps='handled'
            keyboardDismissMode='on-drag'
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            windowSize={7}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews
            extraData={`${updatingSourceId}:${showNsfw}:${isCheckingUpdates}:${newRegistryUrl}:${availableSearch}`}
          />
        </SwipeableRowsProvider>
      </ThemedView>
    </>
  );
}

const GroupedCard = memo(function GroupedCard({
  index,
  total,
  children,
}: {
  index: number;
  total: number;
  children: ReactNode;
}) {
  const { colors, radius } = useTheme();
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <View
      style={[
        styles.groupedCard,
        {
          backgroundColor: colors.secondarySystemBackground,
          borderTopLeftRadius: isFirst ? radius.md : 0,
          borderTopRightRadius: isFirst ? radius.md : 0,
          borderBottomLeftRadius: isLast ? radius.md : 0,
          borderBottomRightRadius: isLast ? radius.md : 0,
          marginTop: isFirst ? Spacing.sm : 0,
        },
      ]}>
      {children}
      {isLast ? null : <CardSeparator />}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: BottomTabInset + Spacing.lg,
  },
  groupedCard: {
    overflow: 'hidden',
  },
  registryRefreshButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCard: {
    overflow: 'hidden',
  },
  loading: {
    paddingVertical: Spacing.xl,
  },
  catalogLoading: {
    paddingVertical: Spacing.md,
  },
  primaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  switchLabel: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  addRegistryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 44,
    fontSize: 16,
  },
  searchInput: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 44,
    fontSize: 16,
    marginBottom: Spacing.sm,
  },
  addButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  secondaryAction: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  registryEmpty: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  registryEmptyText: {
    textAlign: 'center',
  },
  updateButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  updateButtonLabel: {
    fontWeight: '600',
  },
});

type AddRegistryButtonProps = {
  colors: { tint: string };
  radius: { md: number };
  onPress: () => void;
};

function AddRegistryButton({ colors, radius, onPress }: AddRegistryButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.96, PRESS_SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, PRESS_SPRING);
      }}
      accessibilityRole='button'>
      <Reanimated.View
        style={[styles.addButton, { backgroundColor: colors.tint, borderRadius: radius.md }, animatedStyle]}>
        <ThemedText variant='headline' color='onTint'>
          {t('add')}
        </ThemedText>
      </Reanimated.View>
    </Pressable>
  );
}
