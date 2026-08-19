import {
  bool,
  enumType,
  f32,
  f64,
  i32,
  i64,
  map,
  newtypeVariant,
  option,
  seq,
  string,
  struct,
  structVariant,
  tupleVariant,
  type InferType,
  unitVariant,
} from '@variegated-coffee/serde-postcard-ts';

export const MangaStatusSchema = enumType('MangaStatus', {
  Unknown: unitVariant('Unknown'),
  Ongoing: unitVariant('Ongoing'),
  Completed: unitVariant('Completed'),
  Cancelled: unitVariant('Cancelled'),
  Hiatus: unitVariant('Hiatus'),
});

export const ContentRatingSchema = enumType('ContentRating', {
  Unknown: unitVariant('Unknown'),
  Safe: unitVariant('Safe'),
  Suggestive: unitVariant('Suggestive'),
  NSFW: unitVariant('NSFW'),
});

export const ViewerSchema = enumType('Viewer', {
  Unknown: unitVariant('Unknown'),
  LeftToRight: unitVariant('LeftToRight'),
  RightToLeft: unitVariant('RightToLeft'),
  Vertical: unitVariant('Vertical'),
  Webtoon: unitVariant('Webtoon'),
});

export const UpdateStrategySchema = enumType('UpdateStrategy', {
  Always: unitVariant('Always'),
  Never: unitVariant('Never'),
});

export const ChapterSchema = struct({
  key: string(),
  title: option(string()),
  chapter_number: option(f32()),
  volume_number: option(f32()),
  date_uploaded: option(i64()),
  scanlators: option(seq(string())),
  url: option(string()),
  language: option(string()),
  thumbnail: option(string()),
  locked: bool(),
});

export const MangaSchema = struct({
  key: string(),
  title: string(),
  cover: option(string()),
  artists: option(seq(string())),
  authors: option(seq(string())),
  description: option(string()),
  url: option(string()),
  tags: option(seq(string())),
  status: MangaStatusSchema,
  content_rating: ContentRatingSchema,
  viewer: ViewerSchema,
  update_strategy: UpdateStrategySchema,
  next_update_time: option(i64()),
  chapters: option(seq(ChapterSchema)),
});

export const MangaPageResultSchema = struct({
  entries: seq(MangaSchema),
  has_next_page: bool(),
});

export const FilterValueSchema = enumType('FilterValue', {
  Text: structVariant('Text', { id: string(), value: string() }),
  Sort: structVariant('Sort', { id: string(), index: i32(), ascending: bool() }),
  Check: structVariant('Check', { id: string(), value: i32() }),
  Select: structVariant('Select', { id: string(), value: string() }),
  MultiSelect: structVariant('MultiSelect', {
    id: string(),
    included: seq(string()),
    excluded: seq(string()),
  }),
  Range: structVariant('Range', {
    id: string(),
    from: option(f32()),
    to: option(f32()),
  }),
});

export const ListingKindSchema = enumType('ListingKind', {
  Default: unitVariant('Default'),
  List: unitVariant('List'),
});

export const ListingSchema = struct({
  id: string(),
  name: string(),
  kind: ListingKindSchema,
});

export const PageContextSchema = map(string(), string());

export const PageContentSchema = enumType('PageContent', {
  Url: tupleVariant('Url', string(), option(PageContextSchema)),
  Text: newtypeVariant('Text', string()),
  Zip: tupleVariant('Zip', string(), string()),
});

export const PageSchema = struct({
  content: PageContentSchema,
  thumbnail: option(string()),
  has_description: bool(),
  description: option(string()),
});

export const LinkValueSchema = enumType('LinkValue', {
  Url: newtypeVariant('Url', string()),
  Listing: newtypeVariant('Listing', ListingSchema),
  Manga: newtypeVariant('Manga', MangaSchema),
});

export const LinkSchema = struct({
  title: string(),
  subtitle: option(string()),
  image_url: option(string()),
  value: option(LinkValueSchema),
});

export const FilterItemSchema = struct({
  title: string(),
  values: option(seq(FilterValueSchema)),
});

export const MangaWithChapterSchema = struct({
  manga: MangaSchema,
  chapter: ChapterSchema,
});

export const HomeComponentValueSchema = enumType('HomeComponentValue', {
  ImageScroller: structVariant('ImageScroller', {
    links: seq(LinkSchema),
    auto_scroll_interval: option(f64()),
    width: option(f64()),
    height: option(f64()),
  }),
  BigScroller: structVariant('BigScroller', {
    entries: seq(MangaSchema),
    auto_scroll_interval: option(f64()),
  }),
  Scroller: structVariant('Scroller', {
    entries: seq(LinkSchema),
    listing: option(ListingSchema),
  }),
  MangaList: structVariant('MangaList', {
    ranking: bool(),
    page_size: option(i32()),
    entries: seq(LinkSchema),
    listing: option(ListingSchema),
  }),
  MangaChapterList: structVariant('MangaChapterList', {
    page_size: option(i32()),
    entries: seq(MangaWithChapterSchema),
    listing: option(ListingSchema),
  }),
  Filters: newtypeVariant('Filters', seq(FilterItemSchema)),
  Links: newtypeVariant('Links', seq(LinkSchema)),
});

export const HomeComponentSchema = struct({
  title: option(string()),
  subtitle: option(string()),
  value: HomeComponentValueSchema,
});

export const HomeLayoutSchema = struct({
  components: seq(HomeComponentSchema),
});

export const HomePartialResultSchema = enumType('HomePartialResult', {
  Layout: newtypeVariant('Layout', HomeLayoutSchema),
  Component: newtypeVariant('Component', HomeComponentSchema),
});

export const StringSchema = string();
export const FilterValueListSchema = seq(FilterValueSchema);
export const ListingListSchema = seq(ListingSchema);
export const PageListSchema = seq(PageSchema);

export type PostcardManga = InferType<typeof MangaSchema>;
export type PostcardChapter = InferType<typeof ChapterSchema>;
export type PostcardMangaPageResult = InferType<typeof MangaPageResultSchema>;
export type PostcardPage = InferType<typeof PageSchema>;
export type PostcardHomeLayout = InferType<typeof HomeLayoutSchema>;
export type PostcardListing = InferType<typeof ListingSchema>;
