import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import type {
  InstalledSource,
  RegistryEntry,
  SourceRegistry,
} from "@/parsers/shared/types";
import {
  ILLUSTRATION_SOURCE,
  illustrationModeReady,
  isIllustrationSource,
  useIllustrationMode,
} from "@/services/illustration-mode";
import { DEFAULT_REGISTRY_URL } from "@/utils/registry-deep-link";
import { clearAidokuWasmExportCache } from "@/parsers/aidoku/runner";
import { clearSourceHomeCache } from "@/services/source-home-cache";
import { runLibraryAutoRefreshIfNeeded } from "@/services/library-auto-refresh";
import {
  initNotifications,
  notifyNewSourceUpdates,
} from "@/services/notifications";
import {
  buildCatalogIndex,
  type CatalogSourceEntry,
} from "@/services/registry-catalog";
import {
  findSourceUpdates,
  type SourceUpdateInfo,
} from "@/services/source-updates";
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
} from "@/services/sources";

type SourcesContextValue = {
  installed: InstalledSource[];
  visibleInstalled: InstalledSource[];
  visibleCatalogEntries: CatalogSourceEntry[];
  visiblePendingUpdates: SourceUpdateInfo[];
  visibleRegistries: SourceRegistryList[];
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
  installRegistryEntry: (
    registryUrl: string,
    entry: RegistryEntry,
  ) => Promise<void>;
  updateSource: (update: SourceUpdateInfo) => Promise<void>;
  uninstall: (source: InstalledSource) => Promise<void>;
  pinSource: (source: InstalledSource) => Promise<void>;
  unpinSource: (source: InstalledSource) => Promise<void>;
  moveSource: (
    source: InstalledSource,
    direction: "up" | "down",
  ) => Promise<void>;
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

const ILLUSTRATION_INSTALLED: InstalledSource[] = [ILLUSTRATION_SOURCE];
const EMPTY_CATALOG: CatalogSourceEntry[] = [];
const EMPTY_UPDATES: SourceUpdateInfo[] = [];

const FOREGROUND_CHECK_MIN_INTERVAL_MS = 10 * 60 * 1000;
const AUTO_REFRESH_POLL_MS = 15 * 60 * 1000;

function sameInstalledSources(
  a: InstalledSource[],
  b: InstalledSource[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]!;
    const right = b[index]!;
    if (left === right) continue;
    if (
      left.id !== right.id ||
      left.kind !== right.kind ||
      left.installPath !== right.installPath ||
      left.iconUri !== right.iconUri ||
      left.manifest.info.version !== right.manifest.info.version
    ) {
      return false;
    }
  }
  return true;
}

function sameSourceUpdates(
  a: SourceUpdateInfo[],
  b: SourceUpdateInfo[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (
      a[index]!.sourceId !== b[index]!.sourceId ||
      a[index]!.availableVersion !== b[index]!.availableVersion
    ) {
      return false;
    }
  }
  return true;
}

function sameLayout(a: SourceLayout, b: SourceLayout): boolean {
  return (
    a.order.length === b.order.length &&
    a.pinned.length === b.pinned.length &&
    a.order.every((key, index) => key === b.order[index]) &&
    a.pinned.every((key, index) => key === b.pinned[index])
  );
}

export function SourcesProvider({ children }: { children: React.ReactNode }) {
  const [installed, setInstalledState] = useState<InstalledSource[]>([]);
  const [pendingUpdates, setPendingUpdatesState] = useState<SourceUpdateInfo[]>(
    [],
  );
  const [sourceLayout, setSourceLayoutState] = useState<SourceLayout>({
    order: [],
    pinned: [],
  });
  const installedRef = useRef<InstalledSource[]>([]);
  const lastForegroundCheckRef = useRef(0);

  const setInstalled = useCallback((next: InstalledSource[]) => {
    setInstalledState((previous) =>
      sameInstalledSources(previous, next) ? previous : next,
    );
  }, []);
  const setPendingUpdates = useCallback((next: SourceUpdateInfo[]) => {
    setPendingUpdatesState((previous) =>
      sameSourceUpdates(previous, next) ? previous : next,
    );
  }, []);
  const setSourceLayout = useCallback((next: SourceLayout) => {
    setSourceLayoutState((previous) =>
      sameLayout(previous, next) ? previous : next,
    );
  }, []);
  const [registries, setRegistries] = useState<SourceRegistryList[]>([]);
  const [registryCatalogs, setRegistryCatalogs] = useState<
    Record<string, SourceRegistry | null>
  >({});
  const [showNsfw, setShowNsfwState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const backgroundCheckInFlight = useRef(false);
  const catalogsRef = useRef<Record<string, SourceRegistry | null>>({});

  const installedIds = useMemo(
    () => new Set(installed.map((source) => source.id)),
    [installed],
  );

  const catalogEntries = useMemo(
    () => buildCatalogIndex(registries, registryCatalogs, showNsfw),
    [registries, registryCatalogs, showNsfw],
  );

  const illustration = useIllustrationMode();
  const visibleInstalled = useMemo(
    () => (illustration ? ILLUSTRATION_INSTALLED : installed),
    [illustration, installed],
  );
  const visibleCatalogEntries = useMemo(
    () => (illustration ? EMPTY_CATALOG : catalogEntries),
    [illustration, catalogEntries],
  );
  const visiblePendingUpdates = useMemo(
    () => (illustration ? EMPTY_UPDATES : pendingUpdates),
    [illustration, pendingUpdates],
  );
  const visibleRegistries = useMemo(
    () =>
      illustration
        ? registries.filter((item) => item.url === DEFAULT_REGISTRY_URL)
        : registries,
    [illustration, registries],
  );

  const applyUpdateCheck = useCallback(
    async (
      sources: InstalledSource[],
      catalogs: Record<string, SourceRegistry | null>,
      registryUrls: SourceRegistryList[],
      nsfw: boolean,
      notify: boolean,
    ) => {
      const present = new Set(
        (await getInstalledSources()).map((source) => source.installPath),
      );
      const liveSources = sources.filter((source) =>
        present.has(source.installPath),
      );
      const updates = findSourceUpdates(
        liveSources,
        catalogs,
        registryUrls,
        nsfw,
      );
      setPendingUpdates(updates);

      if (updates.length > 0) {
        const nextLayout = await pinSources(
          updates.map((update) => update.source),
        );
        setSourceLayout(nextLayout);
        setInstalled(sortInstalledSources(liveSources, nextLayout));
      }

      if (notify) {
        await notifyNewSourceUpdates(updates);
      }
    },
    [setInstalled, setPendingUpdates, setSourceLayout],
  );

  const loadCatalogs = useCallback(
    async (urls: SourceRegistryList[], force = false) => {
      const catalogs: Record<string, SourceRegistry | null> = {
        ...catalogsRef.current,
      };

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
    },
    [],
  );

  const hydrateCatalogs = useCallback(
    async (
      urls: SourceRegistryList[],
      sources: InstalledSource[],
      nsfw: boolean,
      notify: boolean,
      force = false,
    ) => {
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
        if (
          syncedRegistries.some(
            (item, index) => item.name !== urls[index]?.name,
          )
        ) {
          await setRegistryUrls(syncedRegistries);
          setRegistries(syncedRegistries);
          urls = syncedRegistries;
        }
        await applyUpdateCheck(sources, catalogs, urls, nsfw, notify);
      } finally {
        setIsCatalogLoading(false);
      }
    },
    [applyUpdateCheck, loadCatalogs, setPendingUpdates],
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    let sources: InstalledSource[] = [];
    let urls: SourceRegistryList[] = [];
    let nsfw = false;
    let layout: SourceLayout = { order: [], pinned: [] };

    try {
      await illustrationModeReady;
      await initNotifications();
      const initialized = await initializeSources();
      sources = initialized.sources;
      layout = initialized.layout;
      [urls, nsfw] = await Promise.all([
        getRegistryUrls(),
        getShowNsfwSources(),
      ]);
      setInstalled(sources);
      setSourceLayout(layout);
      setRegistries(urls);
      setShowNsfwState(nsfw);
    } finally {
      setIsLoading(false);
    }

    await hydrateCatalogs(urls, sources, nsfw, true, false);
    void hydrateCatalogs(urls, sources, nsfw, true, true);
  }, [hydrateCatalogs, setInstalled, setSourceLayout]);

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
  }, [hydrateCatalogs, setInstalled, setSourceLayout]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    installedRef.current = installed;
  }, [installed]);

  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state !== "active") return;
      const now = Date.now();
      if (
        now - lastForegroundCheckRef.current >=
        FOREGROUND_CHECK_MIN_INTERVAL_MS
      ) {
        lastForegroundCheckRef.current = now;
        void refreshInBackground();
      }
      void runLibraryAutoRefreshIfNeeded(installedRef.current);
    };

    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, [refreshInBackground]);

  const hasInstalled = installed.length > 0;

  useEffect(() => {
    if (!hasInstalled) return;
    void runLibraryAutoRefreshIfNeeded(installedRef.current);
    const timer = setInterval(() => {
      void runLibraryAutoRefreshIfNeeded(installedRef.current);
    }, AUTO_REFRESH_POLL_MS);
    return () => clearInterval(timer);
  }, [hasInstalled]);

  const filterRegistry = useCallback(
    (registry: SourceRegistry) => filterByNsfw(registry.sources, showNsfw),
    [showNsfw],
  );

  const isInstalled = useCallback(
    (id: string) => installedIds.has(id),
    [installedIds],
  );

  const isPinned = useCallback(
    (source: InstalledSource) =>
      isSourcePinned(source, sourceLayout, installed),
    [sourceLayout, installed],
  );

  const getSourceUpdate = useCallback(
    (sourceId: string) =>
      pendingUpdates.find((update) => update.sourceId === sourceId),
    [pendingUpdates],
  );

  const value = useMemo<SourcesContextValue>(
    () => ({
      installed,
      visibleInstalled,
      visibleCatalogEntries,
      visiblePendingUpdates,
      visibleRegistries,
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
        if (isIllustrationSource(source)) return;
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
        const [sources, nsfw] = await Promise.all([
          getInstalledSources(),
          getShowNsfwSources(),
        ]);
        await hydrateCatalogs(urls, sources, nsfw, false, false);
        void hydrateCatalogs(urls, sources, nsfw, false, true);
      },
      loadRegistry: (url, force) => loadRegistryFromUrl(url, force),
      filterRegistry,
      isInstalled,
    }),
    [
      installed,
      visibleInstalled,
      visibleCatalogEntries,
      visiblePendingUpdates,
      visibleRegistries,
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
      setInstalled,
      setSourceLayout,
    ],
  );

  return (
    <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>
  );
}

export function useSources() {
  const context = useContext(SourcesContext);
  if (!context) {
    throw new Error("useSources must be used within SourcesProvider");
  }
  return context;
}
