import type { InstalledSource, RegistryEntry, SourceRegistry } from '@/parsers/shared/types';
import {
  cacheRegistry,
  downloadRegistryEntry,
  ensureSourcesDirectory,
  installAidokuPackage,
  installTamdokPackage,
  joinInstallPath,
  listInstalledSources,
  normalizeInstalledIconPath,
  readCachedRegistry,
  uninstallSource,
} from '@/parsers/shared/source-manager';
import { createAidokuSourceRunner } from '@/parsers/aidoku/runner';
import { createTamdokSourceRunner } from '@/parsers/tamdok/runner';
import type { SourceRunner } from '@/parsers/shared/source-runner';
import { fetchSourceRegistry, resolveRegistryAssetUrl } from '@/parsers/aidoku/registry';
import { isAidokuPackageFilename } from '@/parsers/aidoku/package';
import { isTamdokPackageFilename } from '@/parsers/tamdok/package';
import { getValue, hasValue, setValue, storageKeys } from '@/constants/storage';
import * as FileSystem from 'expo-file-system/legacy';
import { DEFAULT_REGISTRY_URL } from '@/utils/registry-deep-link';
import { createRegistryListItem, enrichRegistryListItem, mergeRegistryWithCatalog } from '@/utils/registry-display';

export type SourceRegistryList = {
  id: string;
  url: string;
  name?: string;
};

export type SourceLayout = {
  order: string[];
  pinned: string[];
};

const EMPTY_LAYOUT: SourceLayout = { order: [], pinned: [] };

type LayoutKeyParts = {
  kind?: InstalledSource['kind'];
  id: string;
};

export function getSourceLayoutKey(source: InstalledSource): string {
  return `${source.kind}:${source.id}@v${source.manifest.info.version}`;
}

/** Shared identity for Tamdok/Aidoku pairs (e.g. en.asurascans.tamdok ↔ en.asurascans). */
export function getSourceIdentityKey(source: Pick<InstalledSource, 'kind' | 'id'>): string {
  if (source.kind === 'tamdok' && source.id.endsWith('.tamdok')) {
    return source.id.slice(0, -'.tamdok'.length);
  }
  return source.id;
}

function parseLayoutKeyParts(key: string): LayoutKeyParts | null {
  const versioned = key.match(/^(aidoku|tamdok):(.+)@v\d+$/);
  if (versioned) {
    return { kind: versioned[1] as InstalledSource['kind'], id: versioned[2]! };
  }
  const prefixed = key.match(/^(aidoku|tamdok):(.+)$/);
  if (prefixed) {
    return { kind: prefixed[1] as InstalledSource['kind'], id: prefixed[2]! };
  }
  return null;
}

function resolveSourceForLayoutKey(key: string, sources: InstalledSource[]): InstalledSource | undefined {
  const parts = parseLayoutKeyParts(key);
  if (parts?.kind) {
    return sources.find((source) => source.kind === parts.kind && source.id === parts.id);
  }
  const legacyMatches = sources.filter((source) => source.id === key);
  if (legacyMatches.length === 1) return legacyMatches[0];
  if (legacyMatches.length > 1) {
    return legacyMatches.find((source) => source.kind === 'tamdok') ?? legacyMatches[0];
  }
  return undefined;
}

function normalizeLayoutKey(key: string, sources: InstalledSource[]): string | null {
  const source = resolveSourceForLayoutKey(key, sources);
  return source ? getSourceLayoutKey(source) : null;
}

function normalizeLayoutKeys(keys: string[], sources: InstalledSource[]): string[] {
  const normalized: string[] = [];
  for (const key of keys) {
    const next = normalizeLayoutKey(key, sources);
    if (next && !normalized.includes(next)) {
      normalized.push(next);
    }
  }
  return dedupePinnedByManifestId(normalized, sources);
}

function dedupePinnedByManifestId(keys: string[], sources: InstalledSource[]): string[] {
  const resolvedKeys = keys
    .map((key) => normalizeLayoutKey(key, sources) ?? key)
    .filter((key) => sources.some((source) => getSourceLayoutKey(source) === key));
  const byKey = new Map(sources.map((source) => [getSourceLayoutKey(source), source]));
  const chosen = new Map<string, string>();

  for (const key of resolvedKeys) {
    const source = byKey.get(key);
    if (!source) continue;

    const existingKey = chosen.get(getSourceIdentityKey(source));
    if (!existingKey) {
      chosen.set(getSourceIdentityKey(source), key);
      continue;
    }

    const existing = byKey.get(existingKey);
    if (existing?.kind === 'aidoku' && source.kind === 'tamdok') {
      chosen.set(getSourceIdentityKey(source), key);
    }
  }

  const allowed = new Set(chosen.values());
  return resolvedKeys.filter((key) => allowed.has(key));
}

export function sourceRouteId(source: Pick<InstalledSource, 'kind' | 'id'>): string {
  return `${source.kind}:${source.id}`;
}

export function parseSourceRouteId(raw: string): { kind?: InstalledSource['kind']; id: string } {
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  const match = decoded.match(/^(aidoku|tamdok):(.+?)(?:@v\d+)?$/);
  if (match) {
    return { kind: match[1] as InstalledSource['kind'], id: match[2]! };
  }
  return { id: decoded };
}

export function findInstalledSource(
  sources: InstalledSource[],
  routeId: string,
): InstalledSource | undefined {
  const parsed = parseSourceRouteId(routeId);
  if (parsed.kind) {
    return sources.find((source) => source.kind === parsed.kind && source.id === parsed.id);
  }
  const matches = sources.filter((source) => source.id === parsed.id);
  if (matches.length <= 1) return matches[0];
  return matches.find((source) => source.kind === 'tamdok') ?? matches[0];
}

function hasDuplicateIdentity(source: InstalledSource, sources: InstalledSource[]): boolean {
  const identity = getSourceIdentityKey(source);
  return sources.some(
    (entry) => entry !== source && entry.kind !== source.kind && getSourceIdentityKey(entry) === identity,
  );
}

function unpinnedKeysForIdentity(
  identity: string,
  kindToKeep: InstalledSource['kind'],
  sources: InstalledSource[],
): string[] {
  return sources
    .filter((source) => getSourceIdentityKey(source) === identity && source.kind !== kindToKeep)
    .map((source) => getSourceLayoutKey(source));
}

function normalizeSourceLayout(layout: SourceLayout, sources: InstalledSource[]): SourceLayout {
  const installedKeys = new Set(sources.map((source) => getSourceLayoutKey(source)));
  return {
    order: normalizeLayoutKeys(layout.order, sources).filter((key) => installedKeys.has(key)),
    pinned: dedupePinnedByManifestId(normalizeLayoutKeys(layout.pinned, sources), sources).filter((key) =>
      installedKeys.has(key),
    ),
  };
}

function layoutEquals(a: SourceLayout, b: SourceLayout): boolean {
  return (
    a.order.length === b.order.length &&
    a.pinned.length === b.pinned.length &&
    a.order.every((key, index) => key === b.order[index]) &&
    a.pinned.every((key, index) => key === b.pinned[index])
  );
}

function isIdentityPinned(identity: string, pinned: Set<string>, sources: InstalledSource[]): boolean {
  for (const key of pinned) {
    const source = resolveSourceForLayoutKey(key, sources);
    if (source && getSourceIdentityKey(source) === identity) return true;
  }
  return false;
}

export async function getSourceLayout(): Promise<SourceLayout> {
  const raw = await getValue<SourceLayout>(storageKeys.SOURCE_LAYOUT, EMPTY_LAYOUT);
  const sources = await listInstalledSources();
  const normalized = normalizeSourceLayout(raw, sources);
  if (!layoutEquals(normalized, raw)) {
    await saveSourceLayout(normalized);
  }
  return normalized;
}

async function saveSourceLayout(layout: SourceLayout): Promise<void> {
  await setValue(storageKeys.SOURCE_LAYOUT, layout);
}

export function sortInstalledSources(sources: InstalledSource[], layout: SourceLayout): InstalledSource[] {
  const byKey = new Map(sources.map((source) => [getSourceLayoutKey(source), source]));
  const installedKeys = new Set(sources.map((source) => getSourceLayoutKey(source)));
  const order = layout.order.filter((key) => installedKeys.has(key));
  for (const source of sources) {
    const key = getSourceLayoutKey(source);
    if (!order.includes(key)) {
      order.push(key);
    }
  }
  const pinned = new Set(layout.pinned.filter((key) => installedKeys.has(key)));
  const sortedKeys = [...order.filter((key) => pinned.has(key)), ...order.filter((key) => !pinned.has(key))];
  return sortedKeys.map((key) => byKey.get(key)!);
}

async function syncSourceLayout(sources: InstalledSource[]): Promise<SourceLayout> {
  const layout = await getValue<SourceLayout>(storageKeys.SOURCE_LAYOUT, EMPTY_LAYOUT);
  const nextLayout = normalizeSourceLayout(layout, sources);
  for (const source of sources) {
    const key = getSourceLayoutKey(source);
    if (!nextLayout.order.includes(key)) {
      nextLayout.order.push(key);
    }
  }
  if (!layoutEquals(nextLayout, layout)) {
    await saveSourceLayout(nextLayout);
  }
  return nextLayout;
}

export async function initializeSources(): Promise<{ sources: InstalledSource[]; layout: SourceLayout }> {
  await ensureSourcesDirectory();
  const sources = await listInstalledSources();
  const layout = await syncSourceLayout(sources);
  return { sources: sortInstalledSources(sources, layout), layout };
}

export async function getShowNsfwSources(): Promise<boolean> {
  return getValue(storageKeys.SHOW_NSFW_SOURCES, false);
}

export async function setShowNsfwSources(value: boolean): Promise<void> {
  await setValue(storageKeys.SHOW_NSFW_SOURCES, value);
}

function getDefaultRegistryUrls(): SourceRegistryList[] {
  return [createRegistryListItem(DEFAULT_REGISTRY_URL)];
}

export async function getRegistryUrls(): Promise<SourceRegistryList[]> {
  const hasStored = await hasValue(storageKeys.SOURCE_REGISTRY_URLS);
  if (!hasStored) {
    const defaults = getDefaultRegistryUrls();
    await setValue(storageKeys.SOURCE_REGISTRY_URLS, defaults);
    return defaults;
  }

  const urls = await getValue<SourceRegistryList[]>(storageKeys.SOURCE_REGISTRY_URLS, []);
  return urls.map(enrichRegistryListItem);
}

export async function resetRegistryUrlsToDefault(): Promise<SourceRegistryList[]> {
  const defaults = getDefaultRegistryUrls();
  await setRegistryUrls(defaults);
  return defaults;
}

export async function setRegistryUrls(urls: SourceRegistryList[]): Promise<void> {
  await setValue(storageKeys.SOURCE_REGISTRY_URLS, urls.map(enrichRegistryListItem));
}

export function syncRegistriesWithCatalogs(
  registries: SourceRegistryList[],
  catalogs: Record<string, SourceRegistry | null>,
): SourceRegistryList[] {
  return registries.map((item) => mergeRegistryWithCatalog(item, catalogs[item.url]));
}

export function filterByNsfw<T extends { contentRating?: number }>(entries: T[], showNsfw: boolean): T[] {
  if (showNsfw) return entries;
  return entries.filter((entry) => !entry.contentRating || entry.contentRating === 0);
}

export async function getInstalledSources(): Promise<InstalledSource[]> {
  const sources = await listInstalledSources();
  const layout = await syncSourceLayout(sources);
  return sortInstalledSources(sources, layout);
}

export async function installSourcePackage(data: Uint8Array, filename: string): Promise<InstalledSource> {
  let installed: InstalledSource;
  if (isAidokuPackageFilename(filename)) {
    installed = await installAidokuPackage(data);
  } else if (isTamdokPackageFilename(filename)) {
    installed = await installTamdokPackage(data);
  } else {
    throw new Error('Unsupported package format');
  }
  evictSourceRunner(installed);
  return installed;
}

export async function removeSource(source: InstalledSource): Promise<void> {
  await uninstallSource(source);
  evictSourceRunner(source);
  const layoutKey = getSourceLayoutKey(source);
  const layout = await getSourceLayout();
  await saveSourceLayout({
    order: layout.order.filter((key) => key !== layoutKey),
    pinned: layout.pinned.filter((key) => key !== layoutKey),
  });
}

export async function pinSource(source: InstalledSource): Promise<InstalledSource[]> {
  const layoutKey = getSourceLayoutKey(source);
  const layout = await getSourceLayout();
  const sources = await listInstalledSources();
  const conflicting = unpinnedKeysForIdentity(getSourceIdentityKey(source), source.kind, sources);
  const pinned = layout.pinned.filter((key) => !conflicting.includes(key));
  if (pinned.includes(layoutKey)) {
    if (conflicting.length === 0) {
      return getInstalledSources();
    }
    await saveSourceLayout({ ...layout, pinned });
    return getInstalledSources();
  }
  await saveSourceLayout({ ...layout, pinned: dedupePinnedByManifestId([...pinned, layoutKey], sources) });
  return getInstalledSources();
}

export async function unpinSource(source: InstalledSource): Promise<InstalledSource[]> {
  const layoutKey = getSourceLayoutKey(source);
  const layout = await getSourceLayout();
  if (!layout.pinned.includes(layoutKey)) {
    return getInstalledSources();
  }
  await saveSourceLayout({ ...layout, pinned: layout.pinned.filter((key) => key !== layoutKey) });
  return getInstalledSources();
}

export async function setSourceOrder(sourceKeys: string[]): Promise<InstalledSource[]> {
  const layout = await getSourceLayout();
  const sources = await listInstalledSources();
  const installedKeys = new Set(sources.map((source) => getSourceLayoutKey(source)));
  const order = sourceKeys.filter((key) => installedKeys.has(key));
  for (const source of sources) {
    const key = getSourceLayoutKey(source);
    if (!order.includes(key)) {
      order.push(key);
    }
  }
  const nextLayout = { ...layout, order };
  await saveSourceLayout(nextLayout);
  return sortInstalledSources(sources, nextLayout);
}

export async function moveSource(source: InstalledSource, direction: 'up' | 'down'): Promise<InstalledSource[]> {
  const layout = await getSourceLayout();
  const sources = await listInstalledSources();
  const sorted = sortInstalledSources(sources, layout);
  const layoutKey = getSourceLayoutKey(source);
  const index = sorted.findIndex((entry) => getSourceLayoutKey(entry) === layoutKey);
  if (index === -1) return sorted;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sorted.length) return sorted;

  const nextSorted = [...sorted];
  const current = nextSorted[index]!;
  nextSorted[index] = nextSorted[targetIndex]!;
  nextSorted[targetIndex] = current;
  await saveSourceLayout({
    order: nextSorted.map((entry) => getSourceLayoutKey(entry)),
    pinned: layout.pinned,
  });
  return nextSorted;
}

export function isSourcePinned(
  source: InstalledSource,
  layout: SourceLayout,
  sources: InstalledSource[],
): boolean {
  return normalizeSourceLayout(layout, sources).pinned.includes(getSourceLayoutKey(source));
}

export async function pinSources(sources: InstalledSource[]): Promise<SourceLayout> {
  const layout = await getSourceLayout();
  const installed = await listInstalledSources();
  const pinned = new Set(layout.pinned);
  let changed = false;

  for (const source of sources) {
    const layoutKey = getSourceLayoutKey(source);
    if (source.kind === 'aidoku' && hasDuplicateIdentity(source, installed)) {
      continue;
    }
    const identityAlreadyPinned = isIdentityPinned(getSourceIdentityKey(source), pinned, installed);
    if (identityAlreadyPinned) continue;

    for (const conflictingKey of unpinnedKeysForIdentity(getSourceIdentityKey(source), source.kind, installed)) {
      if (pinned.delete(conflictingKey)) {
        changed = true;
      }
    }

    if (!pinned.has(layoutKey)) {
      pinned.add(layoutKey);
      changed = true;
    }
  }

  if (!changed) return layout;
  const nextLayout = { ...layout, pinned: dedupePinnedByManifestId([...pinned], installed) };
  await saveSourceLayout(nextLayout);
  return nextLayout;
}

const REGISTRY_MEMORY_TTL_MS = 15 * 60 * 1000;
const REGISTRY_DISK_TTL_MS = 6 * 60 * 60 * 1000;

const registryMemoryCache = new Map<string, { registry: SourceRegistry; fetchedAt: number }>();

export async function loadRegistryFromUrl(url: string, force = false): Promise<SourceRegistry> {
  const memoryHit = registryMemoryCache.get(url);
  if (!force && memoryHit && Date.now() - memoryHit.fetchedAt < REGISTRY_MEMORY_TTL_MS) {
    return memoryHit.registry;
  }

  if (!force) {
    const cached = await readCachedRegistry(url);
    if (cached) {
      const registry = cached.data as SourceRegistry;
      registryMemoryCache.set(url, { registry, fetchedAt: Date.now() });
      if (Date.now() - cached.cachedAt < REGISTRY_DISK_TTL_MS) {
        return registry;
      }
    }
  }

  const registry = await fetchSourceRegistry(url);
  await cacheRegistry(url, registry);
  registryMemoryCache.set(url, { registry, fetchedAt: Date.now() });
  return registry;
}

export function primeRegistryCache(url: string, registry: SourceRegistry): void {
  registryMemoryCache.set(url, { registry, fetchedAt: Date.now() });
}

export function clearRegistryMemoryCache(): void {
  registryMemoryCache.clear();
}

export async function installFromRegistry(registryUrl: string, entry: RegistryEntry): Promise<InstalledSource> {
  let data: Uint8Array;
  try {
    data = await downloadRegistryEntry(registryUrl, entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('404')) {
      throw error;
    }
    const registry = await loadRegistryFromUrl(registryUrl, true);
    const refreshed = registry.sources.find((item) => item.id === entry.id);
    if (!refreshed) {
      throw error;
    }
    data = await downloadRegistryEntry(registryUrl, refreshed);
    entry = refreshed;
  }

  const installed =
    entry.downloadURL.endsWith('.aix') || registryUrl.includes('aidoku')
      ? await installAidokuPackage(data)
      : await installTamdokPackage(data);
  evictSourceRunner(installed);

  if (installed.iconUri) {
    return installed;
  }

  if (!entry.iconURL) {
    return installed;
  }

  try {
    const iconUrl = resolveRegistryAssetUrl(registryUrl, entry.iconURL);
    const response = await fetch(iconUrl);
    if (!response.ok) return installed;
    const iconBytes = new Uint8Array(await response.arrayBuffer());
    const iconPath = joinInstallPath(installed.installPath, 'icon.png');
    const base64 = uint8ToBase64(iconBytes);
    await FileSystem.writeAsStringAsync(iconPath, base64, { encoding: FileSystem.EncodingType.Base64 });
    return { ...installed, iconUri: normalizeInstalledIconPath(iconPath) };
  } catch {
    return installed;
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export { resolveRegistryAssetUrl, resolveRegistryIconUrl, registryEntryKind } from '@/parsers/aidoku/registry';

export async function createSourceRunner(source: InstalledSource): Promise<SourceRunner> {
  if (source.kind === 'tamdok') {
    return createTamdokSourceRunner(source);
  }
  return createAidokuSourceRunner(source);
}

const runnerCache = new Map<string, Promise<SourceRunner>>();

function runnerCacheKey(source: Pick<InstalledSource, 'kind' | 'id'>): string {
  return `${source.kind}:${source.id}`;
}

export function getOrCreateSourceRunner(source: InstalledSource): Promise<SourceRunner> {
  const key = runnerCacheKey(source);
  const cached = runnerCache.get(key);
  if (cached) return cached;

  const pending = createSourceRunner(source).catch((error) => {
    runnerCache.delete(key);
    throw error;
  });
  runnerCache.set(key, pending);
  return pending;
}

export function evictSourceRunner(source: Pick<InstalledSource, 'kind' | 'id'>): void {
  runnerCache.delete(runnerCacheKey(source));
}

export function clearSourceRunnerCache(): void {
  runnerCache.clear();
}
