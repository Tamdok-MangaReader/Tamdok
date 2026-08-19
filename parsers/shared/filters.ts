import type { FilterDefinition, FilterValue } from './types';

type AidokuFilterJson = {
  type: string;
  id?: string;
  name?: string;
  title?: string;
  options?: string[];
  ids?: string[];
  min?: number;
  max?: number;
  canAscend?: boolean;
  canExclude?: boolean;
  usesTagStyle?: boolean;
  hideFromHeader?: boolean;
  default?: string | number | boolean | { index?: number; ascending?: boolean; from?: number; to?: number };
};

function aidokuFilterId(filter: AidokuFilterJson, type: string, index: number): string {
  if (filter.id) return filter.id;
  switch (type) {
    case 'sort':
      return 'SortFilter';
    case 'check':
      return filter.name ?? filter.title ?? 'CheckFilter';
    case 'select':
    case 'multi-select':
      return filter.title ?? `${type}-${index}`;
    default:
      return filter.title ?? `${type}-${index}`;
  }
}

export function parseAidokuFiltersJson(raw: unknown): FilterDefinition[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry, index): FilterDefinition[] => {
    const filter = entry as AidokuFilterJson;
    if (!filter?.type) return [];
    const id = aidokuFilterId(filter, filter.type, index);

    switch (filter.type) {
      case 'sort': {
        const sortDefault =
          typeof filter.default === 'object' && filter.default?.index != null
            ? filter.default
            : { index: typeof filter.default === 'number' ? filter.default : 0, ascending: true };
        return [
          {
            type: 'sort',
            id,
            title: filter.title ?? 'Sort',
            options: filter.options ?? [],
            default: sortDefault.index ?? 0,
            defaultAscending: sortDefault.ascending ?? true,
            canAscend: filter.canAscend,
            hideFromHeader: filter.hideFromHeader,
          },
        ];
      }
      case 'select':
        return [
          {
            type: 'select',
            id,
            title: filter.title ?? id,
            options: zipAidokuOptions(filter.options ?? [], filter.ids ?? []),
            default: typeof filter.default === 'string' ? filter.default : filter.ids?.[0],
            hideFromHeader: filter.hideFromHeader,
          },
        ];
      case 'multi-select':
        return [
          {
            type: 'multiSelect',
            id,
            title: filter.title ?? id,
            options: zipAidokuOptions(filter.options ?? [], filter.ids ?? []),
            usesTagStyle: filter.usesTagStyle,
            hideFromHeader: filter.hideFromHeader,
            canExclude: filter.canExclude,
          },
        ];
      case 'text':
        return [
          {
            type: 'text',
            id,
            title: filter.title ?? id,
            hideFromHeader: filter.hideFromHeader,
          },
        ];
      case 'check':
        return [
          {
            type: 'check',
            id,
            title: filter.name ?? filter.title ?? id,
            default: typeof filter.default === 'boolean' ? filter.default : false,
            hideFromHeader: filter.hideFromHeader,
          },
        ];
      case 'range': {
        const rangeDefault =
          typeof filter.default === 'object' && filter.default != null ? filter.default : { from: filter.min, to: filter.max };
        return [
          {
            type: 'range',
            id,
            title: filter.title ?? id,
            min: typeof filter.min === 'number' ? filter.min : undefined,
            max: typeof filter.max === 'number' ? filter.max : undefined,
            default: rangeDefault,
            hideFromHeader: filter.hideFromHeader,
          },
        ];
      }
      default:
        return [];
    }
  });
}

function zipAidokuOptions(labels: string[], ids: string[]): { id: string; label: string }[] {
  if (ids.length > 0) {
    return labels.map((label, index) => ({
      id: ids[index] ?? label,
      label,
    }));
  }
  return labels.map((label) => ({ id: label, label }));
}

/** Drop open-ended range bounds and empty text filters before WASM invoke. */
export function sanitizeFilterValuesForInvoke(
  values: FilterValue[],
  definitions: FilterDefinition[] = [],
  options?: { query?: string; sourceId?: string },
): FilterValue[] {
  const defById = new Map(definitions.map((definition) => [definition.id, definition]));
  const trimmedQuery = options?.query?.trim() ?? '';
  const isMangadex = options?.sourceId?.toLowerCase().includes('mangadex') ?? false;

  return values
    .map((value) => {
      if (value.type !== 'range') return value;

      let from = value.from;
      const to = value.to;

      // Zero means "no minimum" for most Aidoku range filters; rating=0 is valid.
      if (from === 0 && value.id !== 'rating') {
        from = undefined;
      }

      return { ...value, from, to };
    })
    .filter((value) => {
      if (value.type === 'text') return value.value.trim().length > 0;
      if (value.type === 'multiSelect') {
        return value.included.length > 0 || (value.excluded?.length ?? 0) > 0;
      }
      return true;
    })
    .map((value) => {
      if (!trimmedQuery || !isMangadex || value.type !== 'sort') return value;

      const definition = defById.get(value.id);
      if (definition?.type !== 'sort' || definition.options.length < 2) return value;

      return { ...value, index: 1, ascending: false };
    });
}

export function defaultFilterValues(definitions: FilterDefinition[]): FilterValue[] {
  return definitions.map((definition) => {
    switch (definition.type) {
      case 'sort':
        return {
          type: 'sort',
          id: definition.id,
          index: definition.default ?? 0,
          ascending: definition.defaultAscending ?? true,
        };
      case 'select':
        return {
          type: 'select',
          id: definition.id,
          value: definition.default ?? definition.options[0]?.id ?? '',
        };
      case 'multiSelect':
        return {
          type: 'multiSelect',
          id: definition.id,
          included: [],
        };
      case 'text':
        return { type: 'text', id: definition.id, value: '' };
      case 'check':
        return { type: 'check', id: definition.id, value: definition.default ?? false };
      case 'range':
        return {
          type: 'range',
          id: definition.id,
          from: definition.default?.from,
          to: definition.default?.to,
        };
    }
  });
}

export function mergeFilterValues(current: FilterValue[], definitions: FilterDefinition[]): FilterValue[] {
  const defaults = defaultFilterValues(definitions);
  const byId = new Map(current.map((value) => [value.id, value]));
  return defaults.map((fallback) => {
    const existing = byId.get(fallback.id);
    if (!existing || existing.type !== fallback.type) return fallback;
    if (fallback.type === 'multiSelect' && existing.type === 'multiSelect') {
      return {
        ...fallback,
        included: existing.included,
        excluded: existing.excluded,
        matchAll: existing.matchAll ?? fallback.matchAll,
      };
    }
    return existing;
  });
}

export function updateFilterValue(values: FilterValue[], next: FilterValue): FilterValue[] {
  const index = values.findIndex((value) => value.id === next.id);
  if (index === -1) return [...values, next];
  const copy = [...values];
  copy[index] = next;
  return copy;
}

export function filterLabel(definition: FilterDefinition, values: FilterValue[]): string {
  const value = values.find((entry) => entry.id === definition.id);
  switch (definition.type) {
    case 'sort': {
      const index = value?.type === 'sort' ? value.index : definition.default ?? 0;
      return definition.options[index] ?? definition.title;
    }
    case 'select': {
      const selected = value?.type === 'select' ? value.value : definition.default ?? definition.options[0]?.id;
      return definition.options.find((option) => option.id === selected)?.label ?? definition.title;
    }
    case 'multiSelect': {
      const count = value?.type === 'multiSelect' ? value.included.length : 0;
      return count > 0 ? `${definition.title} (${count})` : definition.title;
    }
    default:
      return definition.title;
  }
}

export function isInlineFilter(definition: FilterDefinition): boolean {
  if ('hideFromHeader' in definition && definition.hideFromHeader) return false;
  return definition.type === 'sort' || definition.type === 'select' || definition.type === 'multiSelect';
}
