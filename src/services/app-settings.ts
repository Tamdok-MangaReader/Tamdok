import { getValue, setValue, storageKeys } from '@/constants/storage';
import { notifyAppSettingsChanged } from '@/utils/app-settings-events';

export type ReadingMode = 'default' | 'auto' | 'rtl' | 'ltr' | 'vertical' | 'webtoon' | 'continuous';
export type ResolvedReadingMode = 'rtl' | 'ltr' | 'vertical' | 'webtoon' | 'continuous';
export type ReaderBackgroundColor = 'system' | 'white' | 'black';
export type ReaderOrientation = 'device' | 'portrait' | 'landscape';
export type TapZones = 'disabled' | 'left-right' | 'l-shaped' | 'kindle' | 'edge' | 'auto';
export type PagedPageLayout = 'auto' | 'single' | 'double';
export type TextReaderStyle = 'scroll' | 'paged';
export type PillarboxOrientation = 'both' | 'horizontal' | 'vertical';

export type DictionaryLookupGesture = 'single-tap' | 'long-press';
export type DictionaryDisplayMode = 'popup' | 'fullWidth';
export type DictionaryOverlayInteractionMode = 'none' | 'lookup' | 'select';

export type DictionarySettings = {
  enable: boolean;
  lookupGesture: DictionaryLookupGesture;
  textOverlayMode: boolean;
  overlayPadding: number;
  overlayTextScaleMultiplier: number;
  restrictOCRLanguages: boolean;
  restrictedOCRLanguages: string[];
  displayMode: DictionaryDisplayMode;
  popupWidth: number;
  popupHeight: number;
};

export type ReaderSettings = {
  readingMode: ReadingMode;
  skipDuplicateChapters: boolean;
  markDuplicateChapters: boolean;
  downsampleImages: boolean;
  cropBorders: boolean;
  disableQuickActions: boolean;
  disableDoubleTap: boolean;
  liveText: boolean;
  hideBarsOnSwipe: boolean;
  hideStatusBarWithMenu: boolean;
  backgroundColor: ReaderBackgroundColor;
  orientation: ReaderOrientation;
  tapZones: TapZones;
  invertTapZones: boolean;
  animatePageTransitions: boolean;
  pagesToPreload: number;
  pagedPageLayout: PagedPageLayout;
  pagedPageOffset: boolean;
  splitWideImages: boolean;
  reverseSplitOrder: boolean;
  verticalInfiniteScroll: boolean;
  pillarbox: boolean;
  pillarboxAmount: number;
  pillarboxOrientation: PillarboxOrientation;
  textReaderStyle: TextReaderStyle;
  textFontFamily: string;
  textFontSize: number;
  textLineSpacing: number;
  textHorizontalPadding: number;
};

export type DownloadSettings = {
  downloadOnlyOnWifi: boolean;
  deleteAfterReading: boolean;
};

export type LibrarySortMode = 'unread' | 'title' | 'recent' | 'lastRead';

export type LibraryDisplaySettings = {
  showUnreadBadges: boolean;
  showDownloadedBadges: boolean;
  showCategoryCountBadges: boolean;
  showEmptyCategoryCountBadges: boolean;
  showLibraryRefreshStatus: boolean;
  showLibraryRefreshLiveActivity: boolean;
  updateOnWifiOnly: boolean;
  gridSize: 'small' | 'medium' | 'large' | 'extraLarge';
  sortMode: LibrarySortMode;
};

export type DebugSettings = {
  showReaderPageNumbers: boolean;
};

export type AppSettings = {
  incognitoMode: boolean;
  reader: ReaderSettings;
  dictionary: DictionarySettings;
  downloads: DownloadSettings;
  libraryDisplay: LibraryDisplaySettings;
  debug: DebugSettings;
};

const DEFAULT_SETTINGS: AppSettings = {
  incognitoMode: false,
  reader: {
    readingMode: 'auto',
    skipDuplicateChapters: true,
    markDuplicateChapters: true,
    downsampleImages: false,
    cropBorders: false,
    disableQuickActions: false,
    disableDoubleTap: false,
    liveText: false,
    hideBarsOnSwipe: false,
    hideStatusBarWithMenu: true,
    backgroundColor: 'black',
    orientation: 'device',
    tapZones: 'left-right',
    invertTapZones: false,
    animatePageTransitions: true,
    pagesToPreload: 4,
    pagedPageLayout: 'auto',
    pagedPageOffset: false,
    splitWideImages: false,
    reverseSplitOrder: false,
    verticalInfiniteScroll: true,
    pillarbox: false,
    pillarboxAmount: 15,
    pillarboxOrientation: 'both',
    textReaderStyle: 'scroll',
    textFontFamily: 'System',
    textFontSize: 18,
    textLineSpacing: 8,
    textHorizontalPadding: 24,
  },
  dictionary: {
    enable: false,
    lookupGesture: 'long-press',
    textOverlayMode: false,
    overlayPadding: 4,
    overlayTextScaleMultiplier: 1,
    restrictOCRLanguages: false,
    restrictedOCRLanguages: ['en-US'],
    displayMode: 'popup',
    popupWidth: 320,
    popupHeight: 240,
  },
  downloads: {
    downloadOnlyOnWifi: false,
    deleteAfterReading: false,
  },
  libraryDisplay: {
    showUnreadBadges: true,
    showDownloadedBadges: true,
    showCategoryCountBadges: true,
    showEmptyCategoryCountBadges: false,
    showLibraryRefreshStatus: false,
    showLibraryRefreshLiveActivity: true,
    updateOnWifiOnly: false,
    gridSize: 'medium',
    sortMode: 'unread',
  },
  debug: {
    showReaderPageNumbers: false,
  },
};

async function readSettings(): Promise<AppSettings> {
  const stored = await getValue<Partial<AppSettings> | null>(storageKeys.APP_SETTINGS, null);
  if (!stored) return DEFAULT_SETTINGS;
  return {
    incognitoMode: stored.incognitoMode ?? DEFAULT_SETTINGS.incognitoMode,
    reader: {
      ...DEFAULT_SETTINGS.reader,
      ...(stored.reader ?? {}),
      readingMode:
        stored.reader?.readingMode && stored.reader.readingMode !== 'default'
          ? stored.reader.readingMode
          : DEFAULT_SETTINGS.reader.readingMode,
      hideStatusBarWithMenu: stored.reader?.hideStatusBarWithMenu ?? DEFAULT_SETTINGS.reader.hideStatusBarWithMenu,
    },
    dictionary: { ...DEFAULT_SETTINGS.dictionary, ...(stored.dictionary ?? {}) },
    downloads: { ...DEFAULT_SETTINGS.downloads, ...stored.downloads },
    libraryDisplay: {
      ...DEFAULT_SETTINGS.libraryDisplay,
      ...stored.libraryDisplay,
      gridSize: stored.libraryDisplay?.gridSize ?? DEFAULT_SETTINGS.libraryDisplay.gridSize,
      sortMode: stored.libraryDisplay?.sortMode ?? DEFAULT_SETTINGS.libraryDisplay.sortMode,
      showCategoryCountBadges:
        stored.libraryDisplay?.showCategoryCountBadges ?? DEFAULT_SETTINGS.libraryDisplay.showCategoryCountBadges,
      showEmptyCategoryCountBadges:
        stored.libraryDisplay?.showEmptyCategoryCountBadges ??
        DEFAULT_SETTINGS.libraryDisplay.showEmptyCategoryCountBadges,
      showLibraryRefreshStatus:
        stored.libraryDisplay?.showLibraryRefreshStatus ?? DEFAULT_SETTINGS.libraryDisplay.showLibraryRefreshStatus,
      showLibraryRefreshLiveActivity:
        stored.libraryDisplay?.showLibraryRefreshLiveActivity ??
        DEFAULT_SETTINGS.libraryDisplay.showLibraryRefreshLiveActivity,
    },
    debug: {
      ...DEFAULT_SETTINGS.debug,
      ...(stored.debug ?? {}),
    },
  };
}

async function writeSettings(settings: AppSettings): Promise<void> {
  await setValue(storageKeys.APP_SETTINGS, settings);
}

export async function getAppSettings(): Promise<AppSettings> {
  return readSettings();
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await readSettings();
  const next: AppSettings = {
    incognitoMode: patch.incognitoMode ?? current.incognitoMode,
    reader: { ...current.reader, ...patch.reader },
    dictionary: { ...current.dictionary, ...patch.dictionary },
    downloads: { ...current.downloads, ...patch.downloads },
    libraryDisplay: { ...current.libraryDisplay, ...patch.libraryDisplay },
    debug: { ...current.debug, ...patch.debug },
  };
  await writeSettings(next);
  notifyAppSettingsChanged();
  return next;
}

export async function getShowLibraryBadges(): Promise<boolean> {
  const settings = await readSettings();
  return settings.libraryDisplay.showUnreadBadges || settings.libraryDisplay.showDownloadedBadges;
}

export async function resetAppSettings(): Promise<void> {
  await writeSettings(DEFAULT_SETTINGS);
  notifyAppSettingsChanged();
}

export function libraryGridColumns(gridSize: LibraryDisplaySettings['gridSize']): number {
  switch (gridSize) {
    case 'small':
      return 4;
    case 'large':
      return 2;
    case 'extraLarge':
      return 1;
    default:
      return 3;
  }
}
