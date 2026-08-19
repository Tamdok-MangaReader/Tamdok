import { unzipSync } from 'fflate';

import type { Page } from './types';

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;

function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.test(path);
}

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
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Expand Aidoku ZIP/CBZ page entries into renderable image URLs. */
export async function expandZipPages(pages: Page[]): Promise<Page[]> {
  const expanded: Page[] = [];

  for (const page of pages) {
    if (!page.zipUrl) {
      expanded.push(page);
      continue;
    }

    try {
      const response = await fetch(page.zipUrl);
      if (!response.ok) {
        expanded.push(page);
        continue;
      }
      const buffer = new Uint8Array(await response.arrayBuffer());
      const archive = unzipSync(buffer);
      let paths = Object.keys(archive).filter(isImagePath);
      if (page.zipEntry) {
        paths = paths.filter((path) => path.includes(page.zipEntry!));
      }
      for (const path of sortImagePaths(paths)) {
        const bytes = archive[path];
        if (!bytes) continue;
        expanded.push({ url: bytesToDataUrl(path, bytes), thumbnail: page.thumbnail });
      }
    } catch {
      expanded.push(page);
    }
  }

  return expanded;
}
