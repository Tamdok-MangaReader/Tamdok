import type { InstalledSource, RegistryEntry } from '@/parsers/shared/types';

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function isSearchActive(query: string): boolean {
  return normalizeSearchQuery(query).length > 0;
}

export function matchesInstalledSource(source: InstalledSource, query: string): boolean {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return true;

  const name = source.manifest.info.name.toLowerCase();
  const id = source.id.toLowerCase();
  const languages = source.manifest.info.languages.join(' ').toLowerCase();

  return name.includes(normalized) || id.includes(normalized) || languages.includes(normalized);
}

export function catalogEntrySearchText(entry: RegistryEntry): string {
  return `${entry.name} ${entry.id} ${entry.baseURL ?? ''}`.toLowerCase();
}

export function matchesCatalogEntry(entry: RegistryEntry, query: string): boolean {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return true;
  return catalogEntrySearchText(entry).includes(normalized);
}
