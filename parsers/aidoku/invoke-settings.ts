import * as FileSystem from 'expo-file-system/legacy';

import { joinInstallPath } from '../shared/source-manager';
import { getSourceSettings } from '@/services/source-settings';
import type { InstalledSource } from '../shared/types';

// One entry of an Aidoku package's settings.json. `group`/`page` entries nest other entries in `items`.
type AidokuSettingsEntry = {
  type?: string;
  key?: string;
  id?: string;
  default?: unknown;
  items?: AidokuSettingsEntry[];
};

// Default values from settings.json, cached per install path and source version.
const defaultsCache = new Map<string, Record<string, unknown>>();

export function clearAidokuSettingsDefaultsCache(): void {
  defaultsCache.clear();
}

async function readRawAidokuSettingsDefaults(source: InstalledSource): Promise<Record<string, unknown>> {
  const cacheKey = `${source.installPath}|${source.manifest.info.version}`;
  const cached = defaultsCache.get(cacheKey);
  if (cached) return cached;
  const loaded = await loadRawAidokuSettingsDefaults(source);
  defaultsCache.set(cacheKey, loaded);
  return loaded;
}

async function loadRawAidokuSettingsDefaults(source: InstalledSource): Promise<Record<string, unknown>> {
  const settingsPath = joinInstallPath(source.installPath, 'settings.json');
  const info = await FileSystem.getInfoAsync(settingsPath);
  if (!info.exists) return {};

  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(settingsPath)) as unknown;
    if (!Array.isArray(parsed)) return {};

    const defaults: Record<string, unknown> = {};
    collectAidokuDefaults(parsed as AidokuSettingsEntry[], defaults);
    return defaults;
  } catch {
    return {};
  }
}

// Flattens nested settings groups into a key -> default value map.
function collectAidokuDefaults(entries: AidokuSettingsEntry[], defaults: Record<string, unknown>) {
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    if (entry.type === 'group' || entry.type === 'page') {
      collectAidokuDefaults(entry.items ?? [], defaults);
      continue;
    }

    const key = entry.key ?? entry.id;
    if (!key || entry.default === undefined) continue;
    defaults[key] = entry.default;
  }
}

// Many sources fail if no language preference is set. Prefer English/Russian when the source offers
// them, otherwise fall back to the source's own first languages.
function defaultLanguagesForSource(source: InstalledSource): string[] {
  const manifest = source.manifest.info.languages ?? [];
  const preferred = ['en', 'ru'].filter((code) => manifest.includes(code));
  if (preferred.length > 0) return preferred;
  if (manifest.length > 0) return manifest.slice(0, Math.min(5, manifest.length));
  return ['en'];
}

function isMangadexSource(source: InstalledSource): boolean {
  return source.id.toLowerCase().includes('mangadex');
}

// Settings precedence: package defaults < values stored by the user. A few source-specific
// safety defaults are filled in last, only when the user has not chosen anything (for example
// MangaDex requires a content rating list).
export async function getAidokuInvokeSettings(source: InstalledSource): Promise<Record<string, unknown>> {
  const [stored, fromSettingsJson] = await Promise.all([
    getSourceSettings(source.id),
    readRawAidokuSettingsDefaults(source),
  ]);

  const merged: Record<string, unknown> = { ...fromSettingsJson, ...stored };

  if (!Array.isArray(merged.languages) || merged.languages.length === 0) {
    merged.languages = defaultLanguagesForSource(source);
  }

  if (isMangadexSource(source)) {
    if (!Array.isArray(merged.contentRating) || merged.contentRating.length === 0) {
      merged.contentRating = ['safe', 'suggestive', 'erotica', 'pornographic'];
    }
    if (!Array.isArray(merged.blockedUUIDs)) {
      merged.blockedUUIDs = [];
    }
  }

  return merged;
}

// Matches both a missing export and an export that exists but reports itself as unimplemented.
export function isMissingWasmExportError(error: unknown, exportName: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes(`WASM export not found: ${exportName}`) ||
    message.includes('Aidoku source method is unimplemented')
  );
}
