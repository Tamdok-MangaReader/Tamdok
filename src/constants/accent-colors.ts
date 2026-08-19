export type AccentColorId =
  | 'mint'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'teal'
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'coral'
  | 'brown';

export type AccentPreset = {
  id: AccentColorId;
  labelKey: string;
  light: string;
  dark: string;
  swatch: string;
};

/** Default accent first, then chromatic order by hue. */
const ACCENT_HUE_ORDER: Exclude<AccentColorId, 'mint'>[] = [
  'red',
  'orange',
  'yellow',
  'lime',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'coral',
  'brown',
];

const ACCENT_BY_ID: Record<AccentColorId, Omit<AccentPreset, 'id'>> = {
  mint: { labelKey: 'accent_mint', light: '#00C7BE', dark: '#63E6E2', swatch: '#00C7BE' },
  red: { labelKey: 'accent_red', light: '#FF3B30', dark: '#FF453A', swatch: '#FF3B30' },
  orange: { labelKey: 'accent_orange', light: '#FF9500', dark: '#FF9F0A', swatch: '#FF9500' },
  yellow: { labelKey: 'accent_yellow', light: '#FFCC00', dark: '#FFD60A', swatch: '#FFCC00' },
  lime: { labelKey: 'accent_lime', light: '#A8E10C', dark: '#BEF264', swatch: '#A8E10C' },
  green: { labelKey: 'accent_green', light: '#34C759', dark: '#30D158', swatch: '#34C759' },
  teal: { labelKey: 'accent_teal', light: '#5AC8FA', dark: '#64D2FF', swatch: '#5AC8FA' },
  blue: { labelKey: 'accent_blue', light: '#007AFF', dark: '#0A84FF', swatch: '#007AFF' },
  indigo: { labelKey: 'accent_indigo', light: '#5856D6', dark: '#5E5CE6', swatch: '#5856D6' },
  purple: { labelKey: 'accent_purple', light: '#AF52DE', dark: '#BF5AF2', swatch: '#AF52DE' },
  coral: { labelKey: 'accent_coral', light: '#F74A63', dark: '#FF5868', swatch: '#F74A63' },
  brown: { labelKey: 'accent_brown', light: '#A2845E', dark: '#AC8E68', swatch: '#A2845E' },
};

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'mint', ...ACCENT_BY_ID.mint },
  ...ACCENT_HUE_ORDER.map((id) => ({ id, ...ACCENT_BY_ID[id] })),
];

export const DEFAULT_ACCENT_ID: AccentColorId = 'mint';

const LEGACY_ACCENT_IDS: Record<string, AccentColorId> = {
  pink: 'coral',
};

export function normalizeAccentId(id: string): AccentColorId {
  const legacy = LEGACY_ACCENT_IDS[id];
  if (legacy) return legacy;
  return ACCENT_PRESETS.some((preset) => preset.id === id) ? (id as AccentColorId) : DEFAULT_ACCENT_ID;
}

export function getAccentPreset(id: AccentColorId): AccentPreset {
  return ACCENT_PRESETS.find((preset) => preset.id === id) ?? ACCENT_PRESETS[0]!;
}
