import * as FileSystem from 'expo-file-system/legacy';

import { joinInstallPath } from '@/parsers/shared/source-manager';
import { getValue, setValue } from '@/constants/storage';
import type { InstalledSource, TamdokSettingDefinition, TamdokSettingFieldDefinition } from '@/parsers/shared/types';

export type SourceSettingField =
  | { type: 'section'; id: string; title: string; footer?: string }
  | { type: 'link'; id: string; title: string; url: string }
  | { type: 'switch'; id: string; title: string; value: boolean; subtitle?: string }
  | { type: 'select'; id: string; title: string; value: string; options: { id: string; label: string }[] }
  | { type: 'multi-select'; id: string; title: string; value: string[]; options: { id: string; label: string }[] }
  | { type: 'text'; id: string; title: string; value: string; placeholder?: string; secure?: boolean }
  | { type: 'list'; id: string; title: string; value: string[]; placeholder?: string };

type SettingDefinition =
  | TamdokSettingFieldDefinition
  | { type: 'link'; id: string; title: string; url: string }
  | { type: 'section'; id: string; title: string; footer?: string }
  | { type: 'multi-select'; id: string; title: string; options: { id: string; label: string }[]; default?: string[] }
  | { type: 'list'; id: string; title: string; placeholder?: string; default?: string[] };

function settingsStorageKey(sourceId: string): string {
  return `source_settings:${sourceId}`;
}

export async function getSourceSettings(sourceId: string): Promise<Record<string, unknown>> {
  return getValue<Record<string, unknown>>(settingsStorageKey(sourceId), {});
}

/** Stored user values merged with defaults from settings.json / manifest (required for Aidoku WASM). */
export async function getEffectiveSourceSettings(source: InstalledSource): Promise<Record<string, unknown>> {
  const stored = await getSourceSettings(source.id);
  const definitions = await readSettingDefinitions(source);
  const defaults = collectSettingDefaults(definitions);
  return { ...defaults, ...stored };
}

export async function loadSourceSettingFields(source: InstalledSource): Promise<SourceSettingField[]> {
  const stored = await getValue<Record<string, unknown>>(settingsStorageKey(source.id), {});
  const definitions = await readSettingDefinitions(source);
  return definitions.flatMap((definition) => mapDefinition(definition, stored));
}

export async function setSourceSettingValue(sourceId: string, key: string, value: unknown): Promise<void> {
  const stored = await getValue<Record<string, unknown>>(settingsStorageKey(sourceId), {});
  stored[key] = value;
  await setValue(settingsStorageKey(sourceId), stored);

  // WASM and Tamdok JS caches must drop stale apiUrl/cookie values immediately.
  const { hydrateTamdokDefaults } = await import('@/parsers/tamdok/runtime');
  hydrateTamdokDefaults(sourceId, { [key]: value });

  const { resetAidokuSourceRuntime } = await import('@/parsers/aidoku/wasm-bridge');
  resetAidokuSourceRuntime(sourceId);

  const { notifySourceSettingsChanged } = await import('@/utils/source-settings-events');
  notifySourceSettingsChanged();
}

async function readSettingDefinitions(source: InstalledSource): Promise<SettingDefinition[]> {
  const manifestSettings = (source.manifest as { settings?: TamdokSettingDefinition[] }).settings;
  if (manifestSettings?.length) return normalizeTamdokSettings(manifestSettings);

  const settingsPath = joinInstallPath(source.installPath, 'settings.json');
  const info = await FileSystem.getInfoAsync(settingsPath);
  if (!info.exists) return [];

  try {
    const raw = await FileSystem.readAsStringAsync(settingsPath);
    const parsed = JSON.parse(raw) as unknown;
    if (source.kind === 'aidoku' && Array.isArray(parsed)) {
      return parseAidokuSettingsDocument(parsed);
    }
    if (isAidokuSettingsDocument(parsed)) {
      return parseAidokuSettingsDocument(parsed);
    }
    if (Array.isArray(parsed)) {
      return normalizeTamdokSettings(parsed as TamdokSettingDefinition[]);
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { settings?: unknown }).settings)) {
      const settings = (parsed as { settings: TamdokSettingDefinition[] }).settings;
      if (source.kind === 'aidoku') {
        return parseAidokuSettingsDocument(settings as AidokuSettingsEntry[]);
      }
      return normalizeTamdokSettings(settings);
    }
  } catch {
    return [];
  }

  return [];
}

function normalizeTamdokSettings(settings: TamdokSettingDefinition[]): SettingDefinition[] {
  const definitions: SettingDefinition[] = [];
  let sectionIndex = 0;

  for (const item of settings) {
    if (item.type === 'section') {
      definitions.push(item);
      continue;
    }

    if (item.type === 'group') {
      if (item.title.trim()) {
        definitions.push({ type: 'section', id: `section-${sectionIndex++}`, title: item.title.trim() });
      }
      for (const nested of item.items) {
        definitions.push(nested);
      }
      continue;
    }

    definitions.push(item);
  }

  return definitions;
}

function isAidokuSettingsDocument(parsed: unknown): parsed is AidokuSettingsEntry[] {
  return Array.isArray(parsed) && parsed.some(isAidokuSettingsEntry);
}

function isAidokuSettingsEntry(entry: unknown): entry is AidokuSettingsEntry {
  if (!entry || typeof entry !== 'object') return false;
  const type = (entry as AidokuSettingsEntry).type;
  return type === 'group' || type === 'page' || isAidokuLeafSetting(entry as AidokuSettingItem);
}

function isAidokuLeafSetting(item: AidokuSettingItem): boolean {
  return ['switch', 'text', 'select', 'segment', 'login', 'link', 'editable-list', 'multi-select', 'picker', 'button', 'stepper'].includes(item.type);
}

type AidokuSettingsEntry = AidokuSettingsGroup | AidokuPageSetting | AidokuSettingItem;

type AidokuSettingsGroup = {
  type: 'group';
  title?: string;
  footer?: string;
  items?: AidokuSettingItem[];
};

type AidokuPageSetting = {
  type: 'page';
  title?: string;
  footer?: string;
  items?: AidokuSettingsGroup[];
};

type AidokuSettingItem = {
  type: string;
  key?: string;
  id?: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  footer?: string;
  secure?: boolean;
  default?: unknown;
  titles?: string[];
  values?: string[];
  options?: string[] | { id: string; label: string }[];
  items?: AidokuSettingItem[];
  url?: string;
  lineLimit?: number;
  inline?: boolean;
};

function parseAidokuSettingsDocument(entries: AidokuSettingsEntry[]): SettingDefinition[] {
  const definitions: SettingDefinition[] = [];
  let sectionIndex = 0;

  const pushSection = (title?: string, footer?: string) => {
    const trimmed = title?.trim();
    if (!trimmed && !footer?.trim()) return;
    definitions.push({
      type: 'section',
      id: `section-${sectionIndex++}`,
      title: trimmed ?? '',
      footer: footer?.trim() || undefined,
    });
  };

  const appendItems = (items: AidokuSettingItem[]) => {
    for (const item of items) {
      const mapped = mapAidokuSettingItem(item);
      if (mapped) definitions.push(mapped);
    }
  };

  for (const entry of entries) {
    if (entry.type === 'group') {
      pushSection(entry.title, entry.footer);
      appendItems(entry.items ?? []);
      continue;
    }

    if (entry.type === 'page') {
      pushSection(entry.title, entry.footer);
      for (const nested of entry.items ?? []) {
        if (nested.type === 'group') {
          pushSection(nested.title, nested.footer);
          appendItems(nested.items ?? []);
          continue;
        }
        const mapped = mapAidokuSettingItem(nested as AidokuSettingItem);
        if (mapped) definitions.push(mapped);
      }
      continue;
    }

    const mapped = mapAidokuSettingItem(entry);
    if (mapped) definitions.push(mapped);
  }

  return definitions;
}

function settingTitle(item: AidokuSettingItem): string {
  const title = item.title?.trim();
  if (title) return title;
  const placeholder = item.placeholder?.trim();
  if (placeholder) return placeholder;
  const key = item.key ?? item.id;
  if (key) return key;
  return 'Setting';
}

function mapAidokuSettingItem(item: AidokuSettingItem): SettingDefinition | null {
  const id = item.key ?? item.id;
  if (!id) return null;
  const title = settingTitle(item);

  switch (item.type) {
    case 'switch':
      return {
        type: 'switch',
        id,
        title,
        default: typeof item.default === 'boolean' ? item.default : false,
        subtitle: item.subtitle,
      };
    case 'text':
      return {
        type: 'text',
        id,
        title,
        default: typeof item.default === 'string' ? item.default : '',
        ...(item.placeholder ? { placeholder: item.placeholder } : {}),
        ...(item.secure ? { secure: item.secure } : {}),
      };
    case 'select':
    case 'picker':
      return {
        type: 'select',
        id,
        title,
        options: buildSelectOptions(item),
        default: typeof item.default === 'string' ? item.default : undefined,
      };
    case 'segment':
      return {
        type: 'select',
        id,
        title,
        options: (item.options ?? []).map((option, index) => ({
          id: String(index),
          label: typeof option === 'string' ? option : option.label,
        })),
        default: typeof item.default === 'number' ? String(item.default) : typeof item.default === 'string' ? item.default : '0',
      };
    case 'multi-select':
      return {
        type: 'multi-select',
        id,
        title,
        options: buildSelectOptions(item),
        default: Array.isArray(item.default) ? item.default.filter((value): value is string => typeof value === 'string') : [],
      };
    case 'editable-list':
      return {
        type: 'list',
        id,
        title,
        placeholder: item.placeholder,
        default: Array.isArray(item.default) ? item.default.filter((value): value is string => typeof value === 'string') : [],
      };
    case 'login':
      if (!item.url) return null;
      return { type: 'link', id, title, url: item.url };
    case 'link':
      if (!item.url) return null;
      return { type: 'link', id, title, url: item.url };
    default:
      return null;
  }
}

function buildSelectOptions(item: AidokuSettingItem): { id: string; label: string }[] {
  if (Array.isArray(item.titles) && Array.isArray(item.values)) {
    return item.titles.map((label, index) => ({
      id: item.values?.[index] ?? String(index),
      label,
    }));
  }

  if (Array.isArray(item.options)) {
    return item.options.map((option, index) => {
      if (typeof option === 'string') {
        return { id: String(index), label: option };
      }
      return option;
    });
  }

  return [];
}

function collectSettingDefaults(definitions: SettingDefinition[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const definition of definitions) {
    if (definition.type === 'section' || definition.type === 'link') continue;
    if (definition.default === undefined) continue;
    defaults[definition.id] = definition.default;
  }

  return defaults;
}

function mapDefinition(definition: SettingDefinition, stored: Record<string, unknown>): SourceSettingField[] {
  if (definition.type === 'section') {
    return [
      {
        type: 'section',
        id: definition.id,
        title: definition.title,
        footer: definition.footer,
      },
    ];
  }

  if (definition.type === 'link') {
    return [{ type: 'link', id: definition.id, title: definition.title, url: definition.url }];
  }

  if (definition.type === 'switch') {
    const value = stored[definition.id];
    return [
      {
        type: 'switch',
        id: definition.id,
        title: definition.title,
        subtitle: definition.subtitle,
        value: typeof value === 'boolean' ? value : Boolean(definition.default ?? false),
      },
    ];
  }

  if (definition.type === 'select') {
    const value = stored[definition.id];
    return [
      {
        type: 'select',
        id: definition.id,
        title: definition.title,
        value: typeof value === 'string' ? value : (definition.default ?? definition.options[0]?.id ?? ''),
        options: definition.options,
      },
    ];
  }

  if (definition.type === 'multi-select') {
    const value = stored[definition.id];
    return [
      {
        type: 'multi-select',
        id: definition.id,
        title: definition.title,
        value: Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : (definition.default ?? []),
        options: definition.options,
      },
    ];
  }

  if (definition.type === 'list') {
    const value = stored[definition.id];
    return [
      {
        type: 'list',
        id: definition.id,
        title: definition.title,
        placeholder: definition.placeholder,
        value: Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : (definition.default ?? []),
      },
    ];
  }

  const value = stored[definition.id];
  return [
    {
      type: 'text',
      id: definition.id,
      title: definition.title,
      placeholder: 'placeholder' in definition ? definition.placeholder : undefined,
      secure: 'secure' in definition ? definition.secure : undefined,
      value: typeof value === 'string' ? value : (definition.default ?? ''),
    },
  ];
}
