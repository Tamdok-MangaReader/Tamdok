import { Platform } from "react-native";
import { getValue, setValue, storageKeys } from "@/constants/storage";
import { notifyAppSettingsChanged } from "@/utils/app-settings-events";

export type ReadingMode =
  "default" | "auto" | "rtl" | "ltr" | "vertical" | "webtoon" | "continuous";
export type ResolvedReadingMode =
  "rtl" | "ltr" | "vertical" | "webtoon" | "continuous";
export type ReaderBackgroundColor = "system" | "white" | "black";
export type ReaderOrientation = "device" | "portrait" | "landscape";
export type TapZones =
  "disabled" | "left-right" | "l-shaped" | "kindle" | "edge" | "auto";
export type PagedPageLayout = "auto" | "single" | "double";
export type TextReaderStyle = "scroll" | "paged";
export type PillarboxOrientation = "both" | "horizontal" | "vertical";

export type DictionaryLookupGesture = "single-tap" | "long-press";
export type DictionaryDisplayMode = "popup" | "fullWidth";
export type DictionaryOverlayInteractionMode = "none" | "lookup" | "select";

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
  showReadingLiveActivity: boolean;
  hideBarsOnSwipe: boolean;
  hideStatusBarWithMenu: boolean;
  backgroundColor: ReaderBackgroundColor;
  orientation: ReaderOrientation;
  tapZones: TapZones;
  invertTapZones: boolean;
  animatePageTransitions: boolean;
  /** iOS: use the regular pager instead of the native page-curl pager. */
  legacyPagedReader: boolean;
  pagesToPreload: number;
  pagedPageLayout: PagedPageLayout;
  pagedPageOffset: boolean;
  splitWideImages: boolean;
  /** Experimental: size webtoon page images to the list cell height to avoid hairline gaps. */
  seamlessPages: boolean;
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

export type LibrarySortMode =
  | "unread"
  | "title"
  | "recent"
  | "lastRead"
  | "chapters"
  | "downloaded";

/** Sort order that applies to one category only, overriding the global one. */
export type LibraryCategorySort = {
  sortMode: LibrarySortMode;
  sortReversed: boolean;
  favoritesFirst?: boolean;
};

export type LibraryDisplayMode = "grid" | "list" | "descriptiveList";

export type LibraryFilters = {
  /** Manga statuses to keep; empty means every status. */
  statuses: string[];
  readState: "all" | "unread" | "read" | "finished";
  downloaded: "all" | "downloaded" | "notDownloaded";
  /** Keep only favorites. */
  favorites: boolean;
  /** Source ids to keep; empty means every source. */
  sourceIds: string[];
};

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  statuses: [],
  readState: "all",
  downloaded: "all",
  favorites: false,
  sourceIds: [],
};

export type LibraryDisplaySettings = {
  /** Title text drawn over each cover in the library grid. */
  showCoverTitles: boolean;
  showUnreadBadges: boolean;
  showDownloadedBadges: boolean;
  showCategoryCountBadges: boolean;
  hideEmptyCategoryCountBadges: boolean;
  hideEmptyCategories: boolean;
  showLibraryRefreshStatus: boolean;
  showLibraryRefreshLiveActivity: boolean;
  /** Spinner on library covers whose title is queued for or being refreshed. */
  showCoverRefreshIndicator: boolean;
  updateOnWifiOnly: boolean;
  gridSize: "small" | "medium" | "large" | "extraLarge";
  /** Items per row in grid mode (1-6); falls back to the value implied by gridSize. */
  gridColumns?: number;
  displayMode: LibraryDisplayMode;
  sortMode: LibrarySortMode;
  /** Flips the natural order of the selected sort mode. */
  sortReversed: boolean;
  /** Keep favorites at the top of the list (off by default). */
  favoritesFirst: boolean;
  /** Per-category sort overrides, keyed by category id. */
  categorySort?: Record<string, LibraryCategorySort>;
  filters: LibraryFilters;
  /** Categories left out of the library summary. */
  summaryExcludedCategoryIds: string[];
};

export type TabBadgeSettings = {
  sourceUpdates: boolean;
  libraryUnread: boolean;
  libraryUnreadUpdatableOnly: boolean;
};

export type DebugSettings = {
  showReaderPageNumbers: boolean;
  showReaderImageSize: boolean;
  readerMaxHeightRatio: number;
};

export type MangaScreenSettings = {
  showBigMangaCover: boolean;
  stretchMangaCover: boolean;
  showChapterNumber: boolean;
};

export type CoverDisplaySettings = {
  showStatusBadge: boolean;
  showRating: boolean;
  /** Badge for completed series whose chapters are all read. */
  showFinishedBadge: boolean;
};

export type SourceDisplaySettings = {
  /** Orange age badge on suggestive sources. */
  showSuggestiveBadge: boolean;
};

export type PrivacySettings = {
  requireBiometrics: boolean;
  showNsfwHistory: boolean;
  separateNsfwHistory: boolean;
  separateNsfwSources: boolean;
  nsfwKillSwitch: boolean;
  hideCategorizedNsfwInAll: boolean;
};

export type AppSettings = {
  incognitoMode: boolean;
  reader: ReaderSettings;
  dictionary: DictionarySettings;
  downloads: DownloadSettings;
  libraryDisplay: LibraryDisplaySettings;
  mangaScreen: MangaScreenSettings;
  coverDisplay: CoverDisplaySettings;
  sourceDisplay: SourceDisplaySettings;
  privacy: PrivacySettings;
  tabBadges: TabBadgeSettings;
  debug: DebugSettings;
};

export const DEFAULT_SETTINGS: AppSettings = {
  incognitoMode: false,
  reader: {
    readingMode: "auto",
    skipDuplicateChapters: true,
    markDuplicateChapters: true,
    downsampleImages: true,
    cropBorders: false,
    disableQuickActions: false,
    disableDoubleTap: false,
    liveText: false,
    showReadingLiveActivity: true,
    hideBarsOnSwipe: true,
    hideStatusBarWithMenu: true,
    backgroundColor: "black",
    orientation: "device",
    tapZones: "left-right",
    invertTapZones: false,
    animatePageTransitions: true,
    legacyPagedReader: false,
    pagesToPreload: 4,
    pagedPageLayout: "auto",
    pagedPageOffset: false,
    splitWideImages: false,
    seamlessPages: false,
    reverseSplitOrder: false,
    verticalInfiniteScroll: true,
    pillarbox: false,
    pillarboxAmount: 15,
    pillarboxOrientation: "both",
    textReaderStyle: "scroll",
    textFontFamily: "System",
    textFontSize: 18,
    textLineSpacing: 8,
    textHorizontalPadding: 24,
  },
  dictionary: {
    enable: false,
    lookupGesture: "long-press",
    textOverlayMode: false,
    overlayPadding: 4,
    overlayTextScaleMultiplier: 1,
    restrictOCRLanguages: false,
    restrictedOCRLanguages: ["en-US"],
    displayMode: "popup",
    popupWidth: 320,
    popupHeight: 240,
  },
  downloads: {
    downloadOnlyOnWifi: false,
    deleteAfterReading: false,
  },
  libraryDisplay: {
    showCoverTitles: true,
    showUnreadBadges: true,
    showDownloadedBadges: true,
    showCategoryCountBadges: true,
    hideEmptyCategoryCountBadges: true,
    hideEmptyCategories: true,
    showLibraryRefreshStatus: true,
    showLibraryRefreshLiveActivity: true,
    showCoverRefreshIndicator: true,
    updateOnWifiOnly: false,
    gridSize: "medium",
    displayMode: "grid",
    sortMode: "unread",
    sortReversed: false,
    favoritesFirst: false,
    filters: DEFAULT_LIBRARY_FILTERS,
    summaryExcludedCategoryIds: [],
  },
  mangaScreen: {
    showBigMangaCover: Platform.OS !== "android",
    stretchMangaCover: true,
    showChapterNumber: true,
  },
  sourceDisplay: {
    showSuggestiveBadge: true,
  },
  coverDisplay: {
    showStatusBadge: true,
    showRating: true,
    showFinishedBadge: true,
  },
  privacy: {
    requireBiometrics: false,
    showNsfwHistory: true,
    separateNsfwHistory: false,
    separateNsfwSources: false,
    nsfwKillSwitch: false,
    hideCategorizedNsfwInAll: false,
  },
  tabBadges: {
    sourceUpdates: true,
    libraryUnread: true,
    libraryUnreadUpdatableOnly: true,
  },
  debug: {
    showReaderPageNumbers: false,
    showReaderImageSize: false,
    readerMaxHeightRatio: 100,
  },
};

async function readSettings(): Promise<AppSettings> {
  const stored = await getValue<Partial<AppSettings> | null>(
    storageKeys.APP_SETTINGS,
    null,
  );
  if (!stored) return DEFAULT_SETTINGS;
  return {
    incognitoMode: stored.incognitoMode ?? DEFAULT_SETTINGS.incognitoMode,
    reader: {
      ...DEFAULT_SETTINGS.reader,
      ...(stored.reader ?? {}),
      readingMode:
        stored.reader?.readingMode && stored.reader.readingMode !== "default"
          ? stored.reader.readingMode
          : DEFAULT_SETTINGS.reader.readingMode,
      hideStatusBarWithMenu:
        stored.reader?.hideStatusBarWithMenu ??
        DEFAULT_SETTINGS.reader.hideStatusBarWithMenu,
    },
    dictionary: {
      ...DEFAULT_SETTINGS.dictionary,
      ...(stored.dictionary ?? {}),
    },
    downloads: { ...DEFAULT_SETTINGS.downloads, ...stored.downloads },
    libraryDisplay: {
      ...DEFAULT_SETTINGS.libraryDisplay,
      ...stored.libraryDisplay,
      gridSize:
        stored.libraryDisplay?.gridSize ??
        DEFAULT_SETTINGS.libraryDisplay.gridSize,
      sortMode:
        stored.libraryDisplay?.sortMode ??
        DEFAULT_SETTINGS.libraryDisplay.sortMode,
      displayMode:
        stored.libraryDisplay?.displayMode ??
        DEFAULT_SETTINGS.libraryDisplay.displayMode,
      sortReversed:
        stored.libraryDisplay?.sortReversed ??
        DEFAULT_SETTINGS.libraryDisplay.sortReversed,
      filters: {
        ...DEFAULT_LIBRARY_FILTERS,
        ...(stored.libraryDisplay?.filters ?? {}),
      },
      showCategoryCountBadges:
        stored.libraryDisplay?.showCategoryCountBadges ??
        DEFAULT_SETTINGS.libraryDisplay.showCategoryCountBadges,
      hideEmptyCategories:
        stored.libraryDisplay?.hideEmptyCategories ??
        DEFAULT_SETTINGS.libraryDisplay.hideEmptyCategories,
      hideEmptyCategoryCountBadges:
        stored.libraryDisplay?.hideEmptyCategoryCountBadges ??
        DEFAULT_SETTINGS.libraryDisplay.hideEmptyCategoryCountBadges,
      showLibraryRefreshStatus:
        stored.libraryDisplay?.showLibraryRefreshStatus ??
        DEFAULT_SETTINGS.libraryDisplay.showLibraryRefreshStatus,
      showLibraryRefreshLiveActivity:
        stored.libraryDisplay?.showLibraryRefreshLiveActivity ??
        DEFAULT_SETTINGS.libraryDisplay.showLibraryRefreshLiveActivity,
      showCoverRefreshIndicator:
        stored.libraryDisplay?.showCoverRefreshIndicator ??
        DEFAULT_SETTINGS.libraryDisplay.showCoverRefreshIndicator,
    },
    mangaScreen: {
      showBigMangaCover:
        stored.mangaScreen?.showBigMangaCover ??
        DEFAULT_SETTINGS.mangaScreen.showBigMangaCover,
      stretchMangaCover:
        stored.mangaScreen?.stretchMangaCover ??
        DEFAULT_SETTINGS.mangaScreen.stretchMangaCover,
      showChapterNumber:
        stored.mangaScreen?.showChapterNumber ??
        DEFAULT_SETTINGS.mangaScreen.showChapterNumber,
    },
    sourceDisplay: {
      showSuggestiveBadge:
        stored.sourceDisplay?.showSuggestiveBadge ??
        DEFAULT_SETTINGS.sourceDisplay.showSuggestiveBadge,
    },
    coverDisplay: {
      showStatusBadge:
        stored.coverDisplay?.showStatusBadge ??
        DEFAULT_SETTINGS.coverDisplay.showStatusBadge,
      showRating:
        stored.coverDisplay?.showRating ??
        DEFAULT_SETTINGS.coverDisplay.showRating,
      showFinishedBadge:
        stored.coverDisplay?.showFinishedBadge ??
        DEFAULT_SETTINGS.coverDisplay.showFinishedBadge,
    },
    privacy: {
      requireBiometrics:
        stored.privacy?.requireBiometrics ??
        DEFAULT_SETTINGS.privacy.requireBiometrics,
      showNsfwHistory:
        stored.privacy?.showNsfwHistory ??
        DEFAULT_SETTINGS.privacy.showNsfwHistory,
      separateNsfwHistory:
        stored.privacy?.separateNsfwHistory ??
        DEFAULT_SETTINGS.privacy.separateNsfwHistory,
      separateNsfwSources:
        stored.privacy?.separateNsfwSources ??
        DEFAULT_SETTINGS.privacy.separateNsfwSources,
      nsfwKillSwitch:
        stored.privacy?.nsfwKillSwitch ??
        DEFAULT_SETTINGS.privacy.nsfwKillSwitch,
      hideCategorizedNsfwInAll:
        stored.privacy?.hideCategorizedNsfwInAll ??
        DEFAULT_SETTINGS.privacy.hideCategorizedNsfwInAll,
    },
    tabBadges: {
      ...DEFAULT_SETTINGS.tabBadges,
      ...(stored.tabBadges ?? {}),
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

export type AppSettingsPatch = {
  [K in keyof AppSettings]?: AppSettings[K] extends object
    ? Partial<AppSettings[K]>
    : AppSettings[K];
};

export async function updateAppSettings(
  patch: AppSettingsPatch,
): Promise<AppSettings> {
  const current = await readSettings();
  const next: AppSettings = {
    incognitoMode: patch.incognitoMode ?? current.incognitoMode,
    reader: { ...current.reader, ...patch.reader },
    dictionary: { ...current.dictionary, ...patch.dictionary },
    downloads: { ...current.downloads, ...patch.downloads },
    libraryDisplay: {
      ...current.libraryDisplay,
      ...patch.libraryDisplay,
      filters: {
        ...current.libraryDisplay.filters,
        ...patch.libraryDisplay?.filters,
      },
    },
    mangaScreen: { ...current.mangaScreen, ...patch.mangaScreen },
    coverDisplay: { ...current.coverDisplay, ...patch.coverDisplay },
    sourceDisplay: { ...current.sourceDisplay, ...patch.sourceDisplay },
    privacy: { ...current.privacy, ...patch.privacy },
    tabBadges: { ...current.tabBadges, ...patch.tabBadges },
    debug: { ...current.debug, ...patch.debug },
  };
  await writeSettings(next);
  notifyAppSettingsChanged();
  return next;
}

export async function getShowLibraryBadges(): Promise<boolean> {
  const settings = await readSettings();
  return (
    settings.libraryDisplay.showUnreadBadges ||
    settings.libraryDisplay.showDownloadedBadges
  );
}

export async function resetAppSettings(): Promise<void> {
  await writeSettings(DEFAULT_SETTINGS);
  notifyAppSettingsChanged();
}

/** Effective grid column count: explicit choice wins over the coarse gridSize preset. */
export function libraryDisplayColumns(
  display: Pick<LibraryDisplaySettings, "gridSize" | "gridColumns">,
): number {
  const explicit = display.gridColumns;
  if (explicit && explicit >= 1 && explicit <= 6) return Math.round(explicit);
  return libraryGridColumns(display.gridSize);
}

export function libraryGridColumns(
  gridSize: LibraryDisplaySettings["gridSize"],
): number {
  switch (gridSize) {
    case "small":
      return 4;
    case "large":
      return 2;
    case "extraLarge":
      return 1;
    default:
      return 3;
  }
}
