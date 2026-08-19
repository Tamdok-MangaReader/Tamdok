import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { InstalledSource, RegistryEntry, SourceRegistry } from '@/parsers/shared/types';
import { clearAidokuWasmExportCache } from '@/parsers/aidoku/runner';
import { clearSourceHomeCache } from '@/services/source-home-cache';
import { runLibraryAutoRefreshIfNeeded } from '@/services/library-auto-refresh';
import { initNotifications, notifyNewSourceUpdates } from '@/services/notifications';
import {
  buildCatalogIndex,
  type CatalogSourceEntry,
} from '@/services/registry-catalog';
import {
  findSourceUpdates,
  type SourceUpdateInfo,
} from '@/services/source-updates';
import {
  filterByNsfw,
  getInstalledSources,
  getRegistryUrls,
  getShowNsfwSources,
  getSourceLayout,
  initializeSources,
  installFromRegistry,
  installSourcePackage,
  isSourcePinned,
  loadRegistryFromUrl,
  moveSource,
  pinSource,
  pinSources,
  removeSource,
  clearRegistryMemoryCache,
  setRegistryUrls,
  setShowNsfwSources,
  setSourceOrder,
  sortInstalledSources,
  syncRegistriesWithCatalogs,
  unpinSource,
  type SourceLayout,
  type SourceRegistryList,
} from '@/services/sources';

type SourcesContextValue = {
  installed: InstalledSource[];
  installedIds: Set<string>;
  catalogEntries: CatalogSourceEntry[];
  pendingUpdates: SourceUpdateInfo[];
  sourceLayout: SourceLayout;
  registries: SourceRegistryList[];
  registryCatalogs: Record<string, SourceRegistry | null>;
  showNsfw: boolean;
  isLoading: boolean;
  isCatalogLoading: boolean;
  isCheckingUpdates: boolean;
  refresh: () => Promise<void>;
  refreshInBackground: () => Promise<void>;
  installPackage: (data: Uint8Array, filename: string) => Promise<void>;
  installRegistryEntry: (registryUrl: string, entry: RegistryEntry) => Promise<void>;
  updateSource: (update: SourceUpdateInfo) => Promise<void>;
  uninstall: (source: InstalledSource) => Promise<void>;
  pinSource: (source: InstalledSource) => Promise<void>;
  unpinSource: (source: InstalledSource) => Promise<void>;
  moveSource: (source: InstalledSource, direction: 'up' | 'down') => Promise<void>;
  reorderSources: (sourceKeys: string[]) => Promise<void>;
  isPinned: (source: InstalledSource) => boolean;
  getSourceUpdate: (sourceId: string) => SourceUpdateInfo | undefined;
  setShowNsfw: (value: boolean) => Promise<void>;
  updateRegistries: (urls: SourceRegistryList[]) => Promise<void>;
  loadRegistry: (url: string, force?: boolean) => Promise<SourceRegistry>;
  filterRegistry: (registry: SourceRegistry) => RegistryEntry[];
  isInstalled: (id: string) => boolean;
};

const SourcesContext = createContext<SourcesContextValue | null>(null);

export function SourcesProvider({ children }: { children: React.ReactNode }) {
  const [installed, setInstalled] = useState<InstalledSource[]>([]);
  const [pendingUpdates, setPendingUpdates] = useState<SourceUpdateInfo[]>([]);
  const [sourceLayout, setSourceLayout] = useState<SourceLayout>({ order: [], pinned: [] });
  const [registries, setRegistries] = useState<SourceRegistryList[]>([]);
  const [registryCatalogs, setRegistryCatalogs] = useState<Record<string, SourceRegistry | null>>({});
  const [showNsfw, setShowNsfwState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const backgroundCheckInFlight = useRef(false);
  const catalogsRef = useRef<Record<string, SourceRegistry | null>>({});

  const installedIds = useMemo(() => new Set(installed.map((source) => source.id)), [installed]);

  const catalogEntries = useMemo(
    () => buildCatalogIndex(registries, registryCatalogs, showNsfw),
    [registries, registryCatalogs, showNsfw],
  );

  const applyUpdateCheck = useCallback(
    async (
      sources: InstalledSource[],
      catalogs: Record<string, SourceRegistry | null>,
      registryUrls: SourceRegistryList[],
      nsfw: boolean,
      notify: boolean,
    ) => {
      const updates = findSourceUpdates(sources, catalogs, registryUrls, nsfw);
      setPendingUpdates(updates);

      if (updates.length > 0) {
        const nextLayout = await pinSources(updates.map((update) => update.source));
        setSourceLayout(nextLayout);
        setInstalled(sortInstalledSources(sources, nextLayout));
      }

      if (notify) {
        await notifyNewSourceUpdates(updates);
      }
    },
    [],
  );

  const loadCatalogs = useCallback(async (urls: SourceRegistryList[], force = false) => {
    const catalogs: Record<string, SourceRegistry | null> = { ...catalogsRef.current };

    await Promise.all(
      urls.map(async (item) => {
        if (!force && catalogs[item.url]) return;
        try {
          catalogs[item.url] = await loadRegistryFromUrl(item.url, force);
        } catch {
          catalogs[item.url] = catalogs[item.url] ?? null;
        }
      }),
    );

    catalogsRef.current = catalogs;
    return catalogs;
  }, []);

  const hydrateCatalogs = useCallback(
    async (urls: SourceRegistryList[], sources: InstalledSource[], nsfw: boolean, notify: boolean, force = false) => {
      if (urls.length === 0) {
        setRegistryCatalogs({});
        catalogsRef.current = {};
        setPendingUpdates([]);
        return;
      }

      setIsCatalogLoading(true);
      try {
        const catalogs = await loadCatalogs(urls, force);
        setRegistryCatalogs(catalogs);
        const syncedRegistries = syncRegistriesWithCatalogs(urls, catalogs);
        if (syncedRegistries.some((item, index) => item.name !== urls[index]?.name)) {
          await setRegistryUrls(syncedRegistries);
          setRegistries(syncedRegistries);
          urls = syncedRegistries;
        }
        await applyUpdateCheck(sources, catalogs, urls, nsfw, notify);
      } finally {
        setIsCatalogLoading(false);
      }
    },
    [applyUpdateCheck, loadCatalogs],
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    let sources: InstalledSource[] = [];
    let urls: SourceRegistryList[] = [];
    let nsfw = false;
    let layout: SourceLayout = { order: [], pinned: [] };

    try {
      await initNotifications();
      const initialized = await initializeSources();
      sources = initialized.sources;
      layout = initialized.layout;
      [urls, nsfw] = await Promise.all([getRegistryUrls(), getShowNsfwSources()]);
      setInstalled(sources);
      setSourceLayout(layout);
      setRegistries(urls);
      setShowNsfwState(nsfw);
    } finally {
      setIsLoading(false);
    }

    await hydrateCatalogs(urls, sources, nsfw, true, false);
    void hydrateCatalogs(urls, sources, nsfw, true, true);
  }, [hydrateCatalogs]);

  const refreshInBackground = useCallback(async () => {
    if (backgroundCheckInFlight.current) return;
    backgroundCheckInFlight.current = true;
    setIsCheckingUpdates(true);
    try {
      const sources = await getInstalledSources();
      const [urls, nsfw, layout] = await Promise.all([
        getRegistryUrls(),
        getShowNsfwSources(),
        getSourceLayout(),
      ]);
      setInstalled(sources);
      setSourceLayout(layout);
      setRegistries(urls);
      await hydrateCatalogs(urls, sources, nsfw, true, true);
    } finally {
      setIsCheckingUpdates(false);
      backgroundCheckInFlight.current = false;
    }
  }, [hydrateCatalogs]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        void refreshInBackground();
        void runLibraryAutoRefreshIfNeeded(installed);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [installed, refreshInBackground]);

  useEffect(() => {
    if (installed.length === 0) return;
    void runLibraryAutoRefreshIfNeeded(installed);
    const timer = setInterval(() => {
      void runLibraryAutoRefreshIfNeeded(installed);
    }, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [installed]);

  const filterRegistry = useCallback(
    (registry: SourceRegistry) => filterByNsfw(registry.sources, showNsfw),
    [showNsfw],
  );

  const isInstalled = useCallback((id: string) => installedIds.has(id), [installedIds]);

  const isPinned = useCallback(
    (source: InstalledSource) => isSourcePinned(source, sourceLayout, installed),
    [sourceLayout, installed],
  );

  const getSourceUpdate = useCallback(
    (sourceId: string) => pendingUpdates.find((update) => update.sourceId === sourceId),
    [pendingUpdates],
  );

  const value = useMemo<SourcesContextValue>(
    () => ({
      installed,
      installedIds,
      catalogEntries,
      pendingUpdates,
      sourceLayout,
      registries,
      registryCatalogs,
      showNsfw,
      isLoading,
      isCatalogLoading,
      isCheckingUpdates,
      refresh,
      refreshInBackground,
      installPackage: async (data, filename) => {
        await installSourcePackage(data, filename);
        await refresh();
      },
      installRegistryEntry: async (registryUrl, entry) => {
        await installFromRegistry(registryUrl, entry);
        await refresh();
      },
      updateSource: async (update) => {
        await installFromRegistry(update.registryUrl, update.entry);
        clearRegistryMemoryCache();
        clearAidokuWasmExportCache(update.sourceId);
        await clearSourceHomeCache(update.sourceId);
        await refresh();
      },
      uninstall: async (source) => {
        await removeSource(source);
        await clearSourceHomeCache(source.id);
        await refresh();
      },
      pinSource: async (source) => {
        const next = await pinSource(source);
        setInstalled(next);
        setSourceLayout(await getSourceLayout());
      },
      unpinSource: async (source) => {
        const next = await unpinSource(source);
        setInstalled(next);
        setSourceLayout(await getSourceLayout());
      },
      moveSource: async (source, direction) => {
        const next = await moveSource(source, direction);
        setInstalled(next);
        setSourceLayout(await getSourceLayout());
      },
      reorderSources: async (sourceKeys) => {
        const next = await setSourceOrder(sourceKeys);
        setInstalled(next);
        setSourceLayout(await getSourceLayout());
      },
      isPinned,
      getSourceUpdate,
      setShowNsfw: async (value) => {
        await setShowNsfwSources(value);
        setShowNsfwState(value);
      },
      updateRegistries: async (urls) => {
        await setRegistryUrls(urls);
        setRegistries(urls);
        const [sources, nsfw] = await Promise.all([getInstalledSources(), getShowNsfwSources()]);
        await hydrateCatalogs(urls, sources, nsfw, false, false);
        void hydrateCatalogs(urls, sources, nsfw, false, true);
      },
      loadRegistry: (url, force) => loadRegistryFromUrl(url, force),
      filterRegistry,
      isInstalled,
    }),
    [
      installed,
      installedIds,
      catalogEntries,
      pendingUpdates,
      sourceLayout,
      registries,
      registryCatalogs,
      showNsfw,
      isLoading,
      isCatalogLoading,
      isCheckingUpdates,
      refresh,
      refreshInBackground,
      hydrateCatalogs,
      filterRegistry,
      isInstalled,
      isPinned,
      getSourceUpdate,
    ],
  );

  return <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>;
}

export function useSources() {
  const context = useContext(SourcesContext);
  if (!context) {
    throw new Error('useSources must be used within SourcesProvider');
  }
  return context;
}
