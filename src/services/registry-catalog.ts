import type { RegistryEntry, SourceRegistry } from '@/parsers/shared/types';
import { registryEntryKind } from '@/parsers/aidoku/registry';
import { filterByNsfw } from '@/services/sources';
import type { SourceRegistryList } from '@/services/sources';

export type CatalogSourceEntry = {
  registryUrl: string;
  entry: RegistryEntry;
  kind: 'aidoku' | 'tamdok';
  searchText: string;
};

export function buildCatalogIndex(
  registries: SourceRegistryList[],
  registryCatalogs: Record<string, SourceRegistry | null>,
  showNsfw: boolean,
): CatalogSourceEntry[] {
  const items: CatalogSourceEntry[] = [];

  for (const registry of registries) {
    const catalog = registryCatalogs[registry.url];
    if (!catalog) continue;

    for (const entry of filterByNsfw(catalog.sources, showNsfw)) {
      items.push({
        registryUrl: registry.url,
        entry,
        kind: registryEntryKind(registry.url, entry),
        searchText: `${entry.name} ${entry.id} ${entry.baseURL ?? ''}`.toLowerCase(),
      });
    }
  }

  return items;
}

export function filterCatalogEntries(
  entries: CatalogSourceEntry[],
  installedIds: ReadonlySet<string>,
  options: {
    language?: string | null;
    kind?: 'tamdok' | 'aidoku' | null;
    query?: string;
  },
): CatalogSourceEntry[] {
  const query = options.query?.trim().toLowerCase() ?? '';

  return entries.filter((item) => {
    if (installedIds.has(item.entry.id)) return false;
    if (options.language && !item.entry.languages.includes(options.language)) return false;
    if (options.kind && item.kind !== options.kind) return false;
    if (query && !item.searchText.includes(query)) return false;
    return true;
  });
}

export function collectAvailableLanguages(entries: CatalogSourceEntry[], installedIds: ReadonlySet<string>): string[] {
  const codes = new Set<string>();
  for (const item of entries) {
    if (installedIds.has(item.entry.id)) continue;
    for (const language of item.entry.languages) {
      codes.add(language);
    }
  }
  return [...codes].sort();
}

export function hasBothCatalogKinds(entries: CatalogSourceEntry[], installedIds: ReadonlySet<string>): boolean {
  let tamdok = false;
  let aidoku = false;

  for (const item of entries) {
    if (installedIds.has(item.entry.id)) continue;
    if (item.kind === 'tamdok') tamdok = true;
    if (item.kind === 'aidoku') aidoku = true;
    if (tamdok && aidoku) return true;
  }

  return false;
}
