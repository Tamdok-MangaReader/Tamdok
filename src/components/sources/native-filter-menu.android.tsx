import type { FilterDefinition, FilterValue } from '@/parsers/shared/types';

/** Android keeps the floating panel for every filter. */
export function isNativeMenuFilter(_definition: FilterDefinition): boolean {
  return false;
}

export function NativeFilterMenu(_props: {
  definition: FilterDefinition;
  values: FilterValue[];
  label: string;
  onApply: (next: FilterValue) => void;
}) {
  return null;
}

export function NativeChipMenu(_props: {
  label: string;
  options: Array<{ id: string; label: string }>;
  multiple: boolean;
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  return null;
}

export const NATIVE_MENU_MAX_OPTIONS = 0;
