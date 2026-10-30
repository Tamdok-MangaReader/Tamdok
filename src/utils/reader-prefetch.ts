import { Image } from 'expo-image';

import { isLocalImageUri } from '@/utils/cover-image-source';
import { IMAGE_CACHE_POLICY } from '@/utils/image-memory';
import { isReaderSlowMode, waitForSlowTurn } from '@/utils/reader-slow-mode';

export const READER_PRELOAD_AHEAD = 3;

export function prefetchReaderUrls(urls: Array<string | undefined>, headers?: Record<string, string>) {
  const remote = urls.filter((url): url is string => Boolean(url) && !isLocalImageUri(url || ''));
  if (remote.length === 0) return;
  const options = headers && Object.keys(headers).length > 0 ? { headers, cachePolicy: IMAGE_CACHE_POLICY } : { cachePolicy: IMAGE_CACHE_POLICY };
  if (isReaderSlowMode()) {
    void (async () => {
      for (const url of remote.slice(0, 2)) {
        await waitForSlowTurn();
        if (!isReaderSlowMode()) return;
        void Image.prefetch(url, options);
      }
    })();
    return;
  }
  void Image.prefetch(
    remote,
    headers && Object.keys(headers).length > 0
      ? { headers, cachePolicy: IMAGE_CACHE_POLICY }
      : { cachePolicy: IMAGE_CACHE_POLICY },
  );
}

export function prefetchReaderPagesAhead(pages: Array<{ url?: string }>, currentIndex: number, headers?: Record<string, string>, count = READER_PRELOAD_AHEAD) {
  const start = Math.max(0, currentIndex);
  prefetchReaderUrls(
    pages.slice(start, start + count + 1).map((page) => page.url),
    headers,
  );
}
