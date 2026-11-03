import type { ImageSourcePropType } from 'react-native';

import { ACCENT_PRESETS, type AccentColorId } from '@/constants/accent-colors';

export type ThemedAppIconId =
  | 'orv'
  | 'cat'
  | 'webtoon'
  | 'mono'
  | 'domestic'
  | 'estate'
  | 'dandan'
  | 'strawhat'
  | 'chainsaw'
  | 'frieren'
  | 'tower'
  | 'bike'
  | 'sao'
  | 'lookism'
  | 'system'
  | 'home';
/** `default` is the primary (mint) icon; other ids match accent colors or themed icons. */
export type AppIconId = 'default' | Exclude<AccentColorId, 'mint'> | ThemedAppIconId;

export type AppIconOption = {
  id: AppIconId;
  labelKey: string;
  /** Native alternate icon name. `null` resets to the primary icon. */
  nativeName: string | null;
  preview: ImageSourcePropType;
};

const NATIVE_ICON_NAMES: Record<Exclude<AppIconId, 'default'>, string> = {
  red: 'TamdokRed',
  orange: 'TamdokOrange',
  yellow: 'TamdokYellow',
  lime: 'TamdokLime',
  green: 'TamdokGreen',
  teal: 'TamdokTeal',
  blue: 'TamdokBlue',
  indigo: 'TamdokIndigo',
  purple: 'TamdokPurple',
  coral: 'TamdokCoral',
  brown: 'TamdokBrown',
  orv: 'TamdokOrv',
  cat: 'TamdokCat',
  webtoon: 'TamdokWebtoon',
  mono: 'TamdokMono',
  domestic: 'TamdokDomestic',
  estate: 'TamdokEstate',
  dandan: 'TamdokDandan',
  strawhat: 'TamdokStrawhat',
  chainsaw: 'TamdokChainsaw',
  frieren: 'TamdokFrieren',
  tower: 'TamdokTower',
  bike: 'TamdokBike',
  sao: 'TamdokSao',
  lookism: 'TamdokLookism',
  system: 'TamdokSystem',
  home: 'TamdokHome',
};

const APP_ICON_PREVIEWS: Record<AppIconId, ImageSourcePropType> = {
  default: require('../../assets/app-icons/default/preview.png'),
  red: require('../../assets/app-icons/red/preview.png'),
  orange: require('../../assets/app-icons/orange/preview.png'),
  yellow: require('../../assets/app-icons/yellow/preview.png'),
  lime: require('../../assets/app-icons/lime/preview.png'),
  green: require('../../assets/app-icons/green/preview.png'),
  teal: require('../../assets/app-icons/teal/preview.png'),
  blue: require('../../assets/app-icons/blue/preview.png'),
  indigo: require('../../assets/app-icons/indigo/preview.png'),
  purple: require('../../assets/app-icons/purple/preview.png'),
  coral: require('../../assets/app-icons/coral/preview.png'),
  brown: require('../../assets/app-icons/brown/preview.png'),
  orv: require('../../assets/app-icons-themed/orv/preview.png'),
  cat: require('../../assets/app-icons-themed/cat/preview.png'),
  webtoon: require('../../assets/app-icons-themed/webtoon/preview.png'),
  mono: require('../../assets/app-icons-themed/mono/preview.png'),
  domestic: require('../../assets/app-icons-themed/domestic/preview.png'),
  estate: require('../../assets/app-icons-themed/estate/preview.png'),
  dandan: require('../../assets/app-icons-themed/dandan/preview.png'),
  strawhat: require('../../assets/app-icons-themed/strawhat/preview.png'),
  chainsaw: require('../../assets/app-icons-themed/chainsaw/preview.png'),
  frieren: require('../../assets/app-icons-themed/frieren/preview.png'),
  tower: require('../../assets/app-icons-themed/tower/preview.png'),
  bike: require('../../assets/app-icons-themed/bike/preview.png'),
  sao: require('../../assets/app-icons-themed/sao/preview.png'),
  lookism: require('../../assets/app-icons-themed/lookism/preview.png'),
  system: require('../../assets/app-icons-themed/system/preview.png'),
  home: require('../../assets/app-icons-themed/home/preview.png'),
};

/** Order matches accent swatches: default (mint) first, then by hue. */
export const APP_ICON_OPTIONS: AppIconOption[] = [
  {
    id: 'default',
    labelKey: 'app_icon_default',
    nativeName: null,
    preview: APP_ICON_PREVIEWS.default,
  },
  ...ACCENT_PRESETS.filter((preset) => preset.id !== 'mint').map((preset) => {
    const id = preset.id as Exclude<AccentColorId, 'mint'>;
    return {
      id,
      labelKey: `app_icon_${id}`,
      nativeName: NATIVE_ICON_NAMES[id],
      preview: APP_ICON_PREVIEWS[id],
    };
  }),
];

const THEMED_APP_ICON_IDS: ThemedAppIconId[] = [
  'orv',
  'cat',
  'webtoon',
  'mono',
  'domestic',
  'estate',
  'dandan',
  'strawhat',
  'chainsaw',
  'frieren',
  'tower',
  'bike',
  'sao',
  'lookism',
  'system',
  'home',
];

export const THEMED_APP_ICON_OPTIONS: AppIconOption[] = THEMED_APP_ICON_IDS.map((id) => ({
  id,
  labelKey: `app_icon_${id}`,
  nativeName: NATIVE_ICON_NAMES[id],
  preview: APP_ICON_PREVIEWS[id],
}));

const ALL_APP_ICON_OPTIONS = [...APP_ICON_OPTIONS, ...THEMED_APP_ICON_OPTIONS];

export const DEFAULT_APP_ICON_ID: AppIconId = 'default';

const LEGACY_APP_ICON_IDS: Record<string, AppIconId> = {
  mint: 'default',
  pink: 'coral',
};

export function normalizeAppIconId(id: string): AppIconId {
  const legacy = LEGACY_APP_ICON_IDS[id];
  if (legacy) return legacy;
  return ALL_APP_ICON_OPTIONS.some((option) => option.id === id) ? (id as AppIconId) : DEFAULT_APP_ICON_ID;
}

export function getAppIconOption(id: AppIconId): AppIconOption {
  return ALL_APP_ICON_OPTIONS.find((option) => option.id === id) ?? APP_ICON_OPTIONS[0]!;
}

/** Maps accent color to the matching app icon id. */
export function appIconIdForAccent(accentId: AccentColorId): AppIconId {
  return accentId === 'mint' ? 'default' : accentId;
}
