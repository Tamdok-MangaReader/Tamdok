import * as FileSystem from 'expo-file-system/legacy';
import { unzipSync, zipSync } from 'fflate';

import { parseAidokuPackage } from '../aidoku/package';
import { parseTamdokPackage } from '../tamdok/package';
import { parseAidokuFiltersJson } from './filters';
import type { FilterDefinition, InstalledSource, RegistryEntry, SourceKind, SourceManifest } from './types';

const SOURCES_DIR = `${FileSystem.documentDirectory}sources/`;
const REGISTRY_CACHE_DIR = `${FileSystem.documentDirectory}registry-cache/`;

export function joinInstallPath(installPath: string, filename: string): string {
  const base = installPath.endsWith('/') ? installPath : `${installPath}/`;
  return `${base}${filename}`;
}

export const TAMDOK_COMMUNITY_REGISTRY =
  'https://tamdok-mangareader.github.io/sources/index.min.json';

export const AIDOKU_COMMUNITY_REGISTRY =
  'https://aidoku-community.github.io/sources/index.min.json';

export async function ensureSourcesDirectory(): Promise<void> {
  const info = await FileSystem.getInfoAsync(SOURCES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SOURCES_DIR, { intermediates: true });
  }
}

export async function listInstalledSources(): Promise<InstalledSource[]> {
  await ensureSourcesDirectory();
  const entries = await FileSystem.readDirectoryAsync(SOURCES_DIR);
  const sources: InstalledSource[] = [];

  for (const entry of entries) {
    const installPath = joinInstallPath(SOURCES_DIR, entry);
    const manifestPath = joinInstallPath(installPath, 'source.json');
    const info = await FileSystem.getInfoAsync(manifestPath);
    if (!info.exists) continue;

    const raw = await FileSystem.readAsStringAsync(manifestPath);
    const manifest = JSON.parse(raw) as SourceManifest;
    const kind: SourceKind = entry.startsWith('aidoku-') ? 'aidoku' : 'tamdok';
    const iconPath = joinInstallPath(installPath, 'icon.png');
    const iconInfo = await FileSystem.getInfoAsync(iconPath);

    sources.push({
      id: manifest.info.id,
      kind,
      manifest,
      installPath,
      iconUri: iconInfo.exists ? normalizeInstalledIconPath(iconPath) : undefined,
    });
  }

  return sources.sort((a, b) => a.manifest.info.name.localeCompare(b.manifest.info.name));
}

export async function installAidokuPackage(data: Uint8Array): Promise<InstalledSource> {
  // Wipe old install dir so stale wasm/filters never linger after an update.
  await ensureSourcesDirectory();
  const pkg = parseAidokuPackage(data);
  const dir = `${SOURCES_DIR}aidoku-${pkg.manifest.info.id}/`;
  await FileSystem.deleteAsync(dir, { idempotent: true });
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  await FileSystem.writeAsStringAsync(joinInstallPath(dir, 'source.json'), JSON.stringify(pkg.manifest, null, 2));
  await writeBinary(joinInstallPath(dir, 'main.wasm'), pkg.wasm);
  if (pkg.filters) {
    await FileSystem.writeAsStringAsync(joinInstallPath(dir, 'filters.json'), JSON.stringify(pkg.filters, null, 2));
  }
  if (pkg.settings) {
    await FileSystem.writeAsStringAsync(joinInstallPath(dir, 'settings.json'), JSON.stringify(pkg.settings, null, 2));
  }
  if (pkg.icon) {
    await writeBinary(joinInstallPath(dir, 'icon.png'), pkg.icon);
  }

  return {
    id: pkg.manifest.info.id,
    kind: 'aidoku',
    manifest: pkg.manifest,
    installPath: dir,
    iconUri: pkg.icon ? normalizeInstalledIconPath(joinInstallPath(dir, 'icon.png')) : undefined,
  };
}

export async function installTamdokPackage(data: Uint8Array): Promise<InstalledSource> {
  await ensureSourcesDirectory();
  const pkg = parseTamdokPackage(data);
  const dir = `${SOURCES_DIR}tamdok-${pkg.manifest.info.id}/`;
  await FileSystem.deleteAsync(dir, { idempotent: true });
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  await FileSystem.writeAsStringAsync(joinInstallPath(dir, 'source.json'), JSON.stringify(pkg.manifest, null, 2));
  await FileSystem.writeAsStringAsync(joinInstallPath(dir, 'index.js'), pkg.script);
  if (pkg.filters) {
    await FileSystem.writeAsStringAsync(joinInstallPath(dir, 'filters.json'), JSON.stringify(pkg.filters, null, 2));
  }
  const manifestSettings = (pkg.manifest as { settings?: unknown[] }).settings;
  if (manifestSettings?.length) {
    await FileSystem.writeAsStringAsync(joinInstallPath(dir, 'settings.json'), JSON.stringify(manifestSettings, null, 2));
  }
  if (pkg.icon) {
    await writeBinary(joinInstallPath(dir, 'icon.png'), pkg.icon);
  }

  return {
    id: pkg.manifest.info.id,
    kind: 'tamdok',
    manifest: pkg.manifest,
    installPath: dir,
    iconUri: pkg.icon ? normalizeInstalledIconPath(joinInstallPath(dir, 'icon.png')) : undefined,
  };
}

export async function uninstallSource(source: InstalledSource): Promise<void> {
  await FileSystem.deleteAsync(source.installPath, { idempotent: true });
}

export async function downloadRegistryEntry(
  registryUrl: string,
  entry: RegistryEntry,
): Promise<Uint8Array> {
  const base = registryUrl.replace(/\/[^/]*$/, '/');
  const downloadUrl = new URL(entry.downloadURL, base).toString();
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function cacheRegistry(url: string, data: unknown): Promise<void> {
  await ensureRegistryCacheDirectory();
  const cachePath = registryCachePath(url);
  await FileSystem.writeAsStringAsync(cachePath, JSON.stringify({ cachedAt: Date.now(), data }));
}

export async function readCachedRegistry(url: string): Promise<{ data: unknown; cachedAt: number } | null> {
  await ensureRegistryCacheDirectory();
  const cachePath = registryCachePath(url);
  const info = await FileSystem.getInfoAsync(cachePath);
  if (!info.exists) return null;
  try {
    const raw = await FileSystem.readAsStringAsync(cachePath);
    const cached = JSON.parse(raw) as { cachedAt?: number; data: unknown };
    if (!cached.data) return null;
    return { data: cached.data, cachedAt: cached.cachedAt ?? 0 };
  } catch {
    return null;
  }
}

async function ensureRegistryCacheDirectory(): Promise<void> {
  const info = await FileSystem.getInfoAsync(REGISTRY_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(REGISTRY_CACHE_DIR, { intermediates: true });
  }
}

function registryCachePath(url: string): string {
  const slug = encodeURIComponent(url).replace(/%/g, '_');
  return `${REGISTRY_CACHE_DIR}${slug}.json`;
}

export function buildTamdokPackage(manifest: SourceManifest, script: string, icon?: Uint8Array): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'Payload/source.json': new TextEncoder().encode(JSON.stringify(manifest)),
    'Payload/index.js': new TextEncoder().encode(script),
  };
  if (icon) {
    files['Payload/icon.png'] = icon;
  }
  return zipSync(files);
}

async function writeBinary(path: string, data: Uint8Array): Promise<void> {
  const base64 = uint8ToBase64(data);
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function normalizeInstalledIconPath(path: string): string {
  if (path.startsWith('file://')) return path;
  if (path.startsWith('/')) return `file://${path}`;
  return path;
}

export function installedWasmUri(source: InstalledSource): string | null {
  if (source.kind !== 'aidoku') return null;
  const path = joinInstallPath(source.installPath, 'main.wasm');
  return normalizeInstalledIconPath(path);
}

export async function readInstalledWasm(source: InstalledSource): Promise<Uint8Array | null> {
  if (source.kind !== 'aidoku') return null;
  const path = joinInstallPath(source.installPath, 'main.wasm');
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  const base64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
  return base64ToUint8(base64);
}

export async function readInstalledScript(source: InstalledSource): Promise<string | null> {
  if (source.kind !== 'tamdok') return null;
  const path = joinInstallPath(source.installPath, 'index.js');
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  return FileSystem.readAsStringAsync(path);
}

export async function readInstalledFilters(source: InstalledSource): Promise<FilterDefinition[] | null> {
  const path = joinInstallPath(source.installPath, 'filters.json');
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  try {
    const raw = JSON.parse(await FileSystem.readAsStringAsync(path));
    const parsed = parseAidokuFiltersJson(raw);
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
