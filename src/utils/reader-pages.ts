import { Image as ExpoImage } from "expo-image";
import { Image } from "react-native";

import type { Page } from "@/parsers/shared/types";
import type { ReaderSettings } from "@/services/app-settings";
import { coverImageSource } from "@/utils/cover-image-source";
import { releaseImageRef } from "@/utils/image-memory";
import { readImageSizeFromPrefix } from "@/utils/image-size-from-prefix";

export type ReaderPage = Page & {
  id: string;
  sourceIndex: number;
  splitIndex?: number;
  splitTotal?: number;
};

export const READER_DEFAULT_HEIGHT_RATIO = 1.435;
export const READER_DEFAULT_ASPECT_RATIO = 1 / READER_DEFAULT_HEIGHT_RATIO;

const WIDE_IMAGE_RATIO = 1.35;
const PROBE_CONCURRENCY = 8;
const PREFIX_TIMEOUT_MS = 1800;
const SIZE_CACHE_LIMIT = 4000;

type ImageSize = { width: number; height: number };

const sizeCache = new Map<string, ImageSize>();

function rememberSize(url: string, size: ImageSize): void {
  if (sizeCache.size >= SIZE_CACHE_LIMIT) {
    const oldest = sizeCache.keys().next().value;
    if (oldest !== undefined) sizeCache.delete(oldest);
  }
  sizeCache.set(url, size);
}

export function readerPageAspectFromSize(
  width?: number,
  height?: number,
): number | undefined {
  if (typeof width !== "number" || typeof height !== "number") return undefined;
  if (width <= 0 || height <= 0) return undefined;
  return width / height;
}

export function readerPageFrameHeight(
  page: { width?: number; height?: number; splitTotal?: number },
  containerWidth: number,
  measuredAspect?: number,
  fallbackHeight?: number,
): number {
  const base =
    measuredAspect ?? readerPageAspectFromSize(page.width, page.height);
  if (!base) {
    return Math.max(
      1,
      Math.round(
        fallbackHeight ?? containerWidth / READER_DEFAULT_ASPECT_RATIO,
      ),
    );
  }
  const aspect =
    page.splitTotal && page.splitTotal > 1 ? base / page.splitTotal : base;
  return Math.max(1, Math.round(containerWidth / Math.max(aspect, 0.04)));
}

export function isRenderableReaderPage(page: Page): boolean {
  if (page.text?.trim()) return true;
  if (typeof page.url !== "string" || page.url.length === 0) return false;
  return (
    /^https?:\/\//i.test(page.url) ||
    page.url.startsWith("//") ||
    page.url.startsWith("file:") ||
    page.url.startsWith("data:") ||
    page.url.startsWith("blob:") ||
    page.url.startsWith("/")
  );
}

export function normalizeReaderPage(page: Page): Page {
  if (!page.url) return page;
  if (page.url.startsWith("//")) return { ...page, url: `https:${page.url}` };
  return page;
}

export function filterRenderablePages(pages: Page[]): Page[] {
  return pages.map(normalizeReaderPage);
}

export function buildReaderPages(
  pages: Page[],
  settings: ReaderSettings,
  idPrefix = "",
): ReaderPage[] {
  const result: ReaderPage[] = [];
  const prefix = idPrefix ? `${idPrefix}:` : "";

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]!;
    if (!settings.splitWideImages || !page.url) {
      result.push({ ...page, id: `${prefix}${index}`, sourceIndex: index });
      continue;
    }

    result.push({
      ...page,
      id: `${prefix}${index}-full`,
      sourceIndex: index,
      splitIndex: 0,
      splitTotal: 1,
    });
  }

  return result;
}

function usableImageSize(width?: number, height?: number): ImageSize | null {
  if (!width || !height || width < 16 || height < 16) return null;
  return { width, height };
}

function isRemoteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith("//");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

function probeImageSizeNative(
  url: string,
  headers?: Record<string, string>,
): Promise<ImageSize | null> {
  return new Promise((resolve) => {
    const finish = (width?: number, height?: number) => {
      resolve(usableImageSize(width, height));
    };
    const onFailure = () => finish();
    if (
      headers &&
      Object.keys(headers).length > 0 &&
      typeof Image.getSizeWithHeaders === "function"
    ) {
      Image.getSizeWithHeaders(
        url,
        headers,
        (width, height) => finish(width, height),
        onFailure,
      );
      return;
    }
    Image.getSize(url, (width, height) => finish(width, height), onFailure);
  });
}

async function probeImageSizeExpo(
  url: string,
  headers?: Record<string, string>,
): Promise<ImageSize | null> {
  const ref = await ExpoImage.loadAsync(coverImageSource(url, headers), {
    maxWidth: 64,
    maxHeight: 64,
  });
  try {
    return usableImageSize(ref.width, ref.height);
  } finally {
    releaseImageRef(ref);
  }
}

export async function probeReaderImageDimensions(
  url: string,
  headers?: Record<string, string>,
): Promise<ImageSize | null> {
  const fromPrefix = await withTimeout(
    readImageSizeFromPrefix(url, headers),
    2_200,
  );
  if (fromPrefix) return fromPrefix;
  return withTimeout(probeImageSizeExpo(url, headers), 3_500);
}

async function probeImageSize(
  url: string,
  headers?: Record<string, string>,
  measure: "headers" | "full" = "headers",
): Promise<ImageSize | null> {
  const fromPrefix = await withTimeout(
    readImageSizeFromPrefix(url, headers),
    PREFIX_TIMEOUT_MS,
  );
  const sniffed = fromPrefix
    ? usableImageSize(fromPrefix.width, fromPrefix.height)
    : null;
  if (sniffed) return sniffed;
  if (!isRemoteUrl(url)) {
    const local = await withTimeout(probeImageSizeNative(url, headers), 800);
    if (local) return local;
  }
  if (measure !== "full") return null;
  return withTimeout(probeImageSizeExpo(url, headers), 3500);
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]!, index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

async function resolvePageSize(
  page: Page,
  requestHeaders?: Record<string, string>,
  measure: "headers" | "full" = "headers",
): Promise<ImageSize | null> {
  const existing = usableImageSize(page.width, page.height);
  if (existing) return existing;
  if (!page.url) return null;
  const cached = sizeCache.get(page.url);
  if (cached) return cached;
  const size = await probeImageSize(
    page.url,
    { ...requestHeaders, ...page.headers },
    measure,
  );
  if (size) rememberSize(page.url, size);
  return size;
}

export async function materializeReaderPages(
  pages: Page[],
  settings: ReaderSettings,
  idPrefix = "",
  requestHeaders?: Record<string, string>,
  measure: "headers" | "full" = "headers",
): Promise<ReaderPage[]> {
  let built = buildReaderPages(pages, settings, idPrefix);
  const sizes = await mapPool(built, PROBE_CONCURRENCY, (page) =>
    resolvePageSize(page, requestHeaders, measure),
  );
  built = built.map((page, index) => {
    const size = sizes[index];
    return size ? { ...page, width: size.width, height: size.height } : page;
  });

  if (!settings.splitWideImages) return built;

  const wideFlags = built.map((page) =>
    shouldSplitWideImage(page.width ?? 0, page.height ?? 0),
  );
  built = applyWideImageSplit(built, wideFlags);
  if (!settings.reverseSplitOrder) return built;

  return built.map((page) =>
    page.splitTotal === 2 && page.splitIndex != null
      ? { ...page, splitIndex: page.splitIndex === 0 ? 1 : 0 }
      : page,
  );
}

export function readerPageAspectRatio(
  page: ReaderPage,
  measuredRatio?: number,
): number {
  const ratio = measuredRatio ?? 0.7;
  if (page.splitTotal && page.splitTotal > 1) {
    return ratio / page.splitTotal;
  }
  return ratio;
}

export function shouldSplitWideImage(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  return width / height >= WIDE_IMAGE_RATIO;
}

export function applyWideImageSplit(
  pages: ReaderPage[],
  wideFlags: boolean[],
): ReaderPage[] {
  const result: ReaderPage[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]!;
    if (!page.url || !wideFlags[index]) {
      result.push(page);
      continue;
    }

    const leftId = `${page.id}-left`;
    const rightId = `${page.id}-right`;
    result.push({ ...page, id: leftId, splitIndex: 0, splitTotal: 2 });
    result.push({ ...page, id: rightId, splitIndex: 1, splitTotal: 2 });
  }

  return result;
}

export function splitCropStyle(
  page: ReaderPage,
): { width: string; marginLeft: string } | null {
  if (!page.splitTotal || page.splitTotal <= 1 || page.splitIndex == null)
    return null;
  const widthPercent = `${100 * page.splitTotal}%`;
  const offset = settingsSplitOffset(page);
  return {
    width: widthPercent,
    marginLeft: offset,
  };
}

function settingsSplitOffset(page: ReaderPage): string {
  const index = page.splitIndex ?? 0;
  const total = page.splitTotal ?? 1;
  if (total <= 1) return "0%";
  return `-${(index / total) * 100}%`;
}
