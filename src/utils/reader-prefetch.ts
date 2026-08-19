import { Image } from 'expo-image';

import { isLocalImageUri } from '@/utils/cover-image-source';

export const READER_PRELOAD_AHEAD = 4;

export function prefetchReaderUrls(urls: Array<string | undefined>, headers?: Record<string, string>) {
  const remote = urls.filter((url): url is string => Boolean(url) && !isLocalImageUri(url));
  if (remote.length === 0) return;
  void Image.prefetch(
    remote,
    headers && Object.keys(headers).length > 0 ? { headers, cachePolicy: 'memory-disk' } : { cachePolicy: 'memory-disk' },
  );
}

export function prefetchReaderPagesAhead(
  pages: Array<{ url?: string }>,
  currentIndex: number,
  headers?: Record<string, string>,
  count = READER_PRELOAD_AHEAD,
) {
  const start = Math.max(0, currentIndex);
  prefetchReaderUrls(
    pages.slice(start, start + count + 1).map((page) => page.url),
    headers,
  );
}
