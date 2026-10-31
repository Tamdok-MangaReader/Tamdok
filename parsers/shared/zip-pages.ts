import { unzipSync } from 'fflate';

import { bytesToBase64 } from './base64';
import type { Page } from './types';

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;

function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.test(path);
}

// Natural sort so 2.jpg comes before 10.jpg.
function sortImagePaths(paths: string[]): string[] {
  return paths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function bytesToDataUrl(path: string, bytes: Uint8Array): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? 'jpeg';
  const mime =
    ext === 'png'
      ? 'image/png'
      : ext === 'gif'
        ? 'image/gif'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'avif'
            ? 'image/avif'
            : 'image/jpeg';
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

// Some sources return one "page" that is really a zip of images (zipUrl, optionally filtered by zipEntry).
// This downloads and unpacks it into one data: URL per image. On any failure the original page is kept.
async function expandZipPage(page: Page): Promise<Page[]> {
  if (!page.zipUrl) return [page];

  try {
    const response = await fetch(page.zipUrl);
    if (!response.ok) return [page];
    const buffer = new Uint8Array(await response.arrayBuffer());
    const archive = unzipSync(buffer);
    let paths = Object.keys(archive).filter(isImagePath);
    if (page.zipEntry) {
      paths = paths.filter((path) => path.includes(page.zipEntry!));
    }
    const expanded: Page[] = [];
    for (const path of sortImagePaths(paths)) {
      const bytes = archive[path];
      if (!bytes) continue;
      expanded.push({ url: bytesToDataUrl(path, bytes), thumbnail: page.thumbnail });
    }
    return expanded;
  } catch {
    return [page];
  }
}

export async function expandZipPages(pages: Page[]): Promise<Page[]> {
  const groups = await Promise.all(pages.map(expandZipPage));
  return groups.flat();
}
