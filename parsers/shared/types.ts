// Core data model shared by every source runtime. Runtimes translate their own
// formats into these types so the rest of the app is source-agnostic.
export type MangaStatus =
  "unknown" | "ongoing" | "completed" | "hiatus" | "cancelled";

export type ContentRating = "safe" | "suggestive" | "nsfw";

export type Viewer = "default" | "rtl" | "ltr" | "webtoon" | "vertical";

// A title. `key` is the source-specific identifier (unique within one source).
// Lists usually return a partial Manga (key, title, cover); details and chapters
// are filled in later through getMangaUpdate.
export type Manga = {
  key: string;
  title: string;
  altTitles?: string[];
  cover?: string;
  authors?: string[];
  artists?: string[];
  description?: string;
  url?: string;
  tags?: string[];
  status?: MangaStatus;
  contentRating?: ContentRating;
  rating?: string;
  viewer?: Viewer;
  chapters?: Chapter[];
  sourceId?: string;
};

// A chapter. `key` is the source-specific id. Numbers and dates are optional because
// many sources do not provide them. `dateUploaded` is the upload time as a Unix timestamp.
export type Chapter = {
  key: string;
  title?: string;
  chapterNumber?: number;
  volumeNumber?: number;
  dateUploaded?: number;
  scanlators?: string[];
  url?: string;
  language?: string;
  thumbnail?: string;
  locked?: boolean;
};

// One reader page. Usually `url` (an image), but a source may also return plain `text`
// (text chapters) or a `zipUrl` that is expanded into several images (see zip-pages.ts).
export type Page = {
  url?: string;
  text?: string;
  thumbnail?: string;
  /** Optional pixel size from the source, used to reserve reader layout before decode. */
  width?: number;
  height?: number;
  /** CBZ/ZIP archive URL (Aidoku PageContent::Zip). */
  zipUrl?: string;
  /** Path inside the archive, when specified. */
  zipEntry?: string;
  /** Per-page request headers from Aidoku `PageContext`. */
  headers?: Record<string, string>;
};

export type MangaPageResult = {
  entries: Manga[];
  hasNextPage: boolean;
};

// The user's current value for a filter. The `type` matches the FilterDefinition with the same id.
export type FilterValue =
  | { type: "sort"; id: string; index: number; ascending: boolean }
  | { type: "select"; id: string; value: string }
  | {
      type: "multiSelect";
      id: string;
      included: string[];
      excluded?: string[];
      matchAll?: boolean;
    }
  | { type: "text"; id: string; value: string }
  | { type: "check"; id: string; value: boolean }
  | { type: "range"; id: string; from?: number; to?: number };

// A named, paginated list a source can serve (for example "Popular" or "Latest").
export type Listing = {
  id: string;
  name?: string;
  kind?: "grid" | "list";
};

// Building blocks of a source's home page (modelled after Aidoku's home layout).
export type HomeComponentKind =
  | "scroller"
  | "bigScroller"
  | "mangaGrid"
  | "mangaList"
  | "mangaChapterList"
  | "filters"
  | "links";

export type HomeLink = Manga | { type: "listing"; listing: Listing };

/** Aidoku home Filters row item. */
export type HomeFilterItem = {
  title: string;
  filters: FilterValue[];
};

/** Aidoku home Links row item. */
export type HomeNavigationLink = {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  url?: string;
  listing?: Listing;
  manga?: Manga;
};

export type HomeChapterEntry = {
  manga: Manga;
  chapter: Chapter;
};

/** Scroller row from Aidoku Link (title/cover + optional subtitle, often rating). */
export type HomeScrollerEntry = {
  manga: Manga;
  /** Cover URL from the home feed; kept separate so enrichment cannot swap in banner art. */
  homeCover?: string;
  subtitle?: string;
  chapter?: Chapter;
};

export type HomeComponent = {
  title?: string;
  subtitle?: string;
  kind: HomeComponentKind;
  entries: Manga[];
  scrollerEntries?: HomeScrollerEntry[];
  chapterEntries?: HomeChapterEntry[];
  listing?: Listing;
  pageSize?: number;
  ranking?: boolean;
  /** Seconds between auto-advance slides (Aidoku BigScroller). */
  autoScrollInterval?: number;
  filterItems?: HomeFilterItem[];
  links?: HomeNavigationLink[];
};

export type HomeLayout = {
  components: HomeComponent[];
};

// Describes the filters a source supports so the UI can render them.
// A source returns definitions; the app keeps the matching FilterValue list.
export type FilterDefinition =
  | {
      type: "sort";
      id: string;
      title: string;
      options: string[];
      default?: number;
      defaultAscending?: boolean;
      hideFromHeader?: boolean;
      canAscend?: boolean;
    }
  | {
      type: "select";
      id: string;
      title: string;
      options: { id: string; label: string }[];
      default?: string;
      hideFromHeader?: boolean;
    }
  | {
      type: "multiSelect";
      id: string;
      title: string;
      options: { id: string; label: string }[];
      usesTagStyle?: boolean;
      hideFromHeader?: boolean;
      canExclude?: boolean;
    }
  | {
      type: "text";
      id: string;
      title: string;
      placeholder?: string;
      hideFromHeader?: boolean;
    }
  | {
      type: "check";
      id: string;
      title: string;
      default?: boolean;
      hideFromHeader?: boolean;
    }
  | {
      type: "range";
      id: string;
      title: string;
      min?: number;
      max?: number;
      default?: { from?: number; to?: number };
      hideFromHeader?: boolean;
    };

// Manifest of a Tamdok (JavaScript) source: static metadata plus declarative listings, filters and settings.
export type TamdokSourceManifest = {
  info: SourceInfo;
  listings?: Listing[];
  filters?: FilterDefinition[];
  settings?: TamdokSettingDefinition[];
  home?: { listings?: string[] };
};

export type TamdokSettingDefinition =
  | { type: "section"; id: string; title: string }
  | {
      type: "group";
      title: string;
      items: TamdokSettingFieldDefinition[];
    }
  | TamdokSettingFieldDefinition;

export type TamdokSettingFieldDefinition =
  | {
      type: "switch";
      id: string;
      title: string;
      default?: boolean;
      subtitle?: string;
    }
  | {
      type: "select";
      id: string;
      title: string;
      options: { id: string; label: string }[];
      default?: string;
    }
  | {
      type: "text";
      id: string;
      title: string;
      default?: string;
      placeholder?: string;
      secure?: boolean;
    }
  | { type: "link"; id: string; title: string; url: string }
  | { type: "login"; id: string; title: string; url: string };

// What a Tamdok source's index.js must export. Every function is optional; the runtime only
// advertises capabilities that the module actually implements.
export type TamdokSourceModule = {
  getSearchMangaList?: (
    params: SourceListParams,
    ctx: TamdokSourceContext,
  ) => Promise<MangaPageResult>;
  getMangaList?: (
    listing: Listing,
    page: number,
    ctx: TamdokSourceContext,
  ) => Promise<MangaPageResult>;
  getMangaUpdate?: (
    manga: Manga,
    needsDetails: boolean,
    needsChapters: boolean,
    ctx: TamdokSourceContext,
  ) => Promise<Manga>;
  getPageList?: (
    manga: Manga,
    chapter: Chapter,
    ctx: TamdokSourceContext,
  ) => Promise<Page[]>;
  getHome?: (ctx: TamdokSourceContext) => Promise<HomeLayout>;
  getListings?: (ctx: TamdokSourceContext) => Promise<Listing[]>;
  getFilters?: (ctx: TamdokSourceContext) => Promise<FilterDefinition[]>;
};

// Static information about a source. `minAppVersion`/`maxAppVersion` let a source declare compatibility.
export type SourceInfo = {
  id: string;
  name: string;
  version: number;
  languages: string[];
  url?: string;
  urls?: string[];
  contentRating?: number;
  minAppVersion?: string;
  maxAppVersion?: string;
};

export type SourceManifest = {
  info: SourceInfo;
  listings?: Listing[];
  config?: Record<string, unknown>;
};

// `aidoku` sources run as WASM modules, `tamdok` sources run as JavaScript.
export type SourceKind = "aidoku" | "tamdok";

export type InstalledSource = {
  id: string;
  kind: SourceKind;
  manifest: SourceManifest;
  installPath: string;
  iconUri?: string;
};

// One source listed in a registry's index.min.json. `downloadURL` may be relative to the registry URL.
export type RegistryEntry = {
  id: string;
  name: string;
  version: number;
  iconURL?: string;
  downloadURL: string;
  languages: string[];
  contentRating?: number;
  baseURL?: string;
  minAppVersion?: string;
  maxAppVersion?: string;
};

export type SourceRegistry = {
  name: string;
  iconURL?: string;
  sources: RegistryEntry[];
};

export type SourceListParams = {
  query?: string;
  page: number;
  filters?: FilterValue[];
};

// Object passed as the last argument to every Tamdok source function.
export type TamdokSourceContext = {
  request: TamdokRequest;
  defaults: TamdokDefaults;
  cookies: Promise<JSON | null>;
  sourceId: string;
};

// HTTP helpers for sources. All of them go through the shared fetch layer
// (throttling, retries, Cloudflare clearance), so sources should not call fetch() directly.
export type TamdokRequest = {
  get: (url: string, init?: RequestInit) => Promise<TamdokResponse>;
  post: (url: string, init?: RequestInit) => Promise<TamdokResponse>;
  fetch: (url: string, init?: RequestInit) => Promise<TamdokResponse>;
};

export type TamdokResponse = {
  status: number;
  url: string;
  text: () => Promise<string>;
  json: <T>() => Promise<T>;
  html: () => import("node-html-parser").HTMLElement;
};

// Per-source persistent key/value storage (backs the source's settings).
export type TamdokDefaults = {
  get: <T>(key: string, fallback?: T) => T | undefined;
  set: <T>(key: string, value: T) => Promise<void>;
};
