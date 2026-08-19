export function normalizeRegistryUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    parsed.search = '';

    let pathname = parsed.pathname.replace(/\/+$/, '');
    if (pathname.endsWith('/index.min.json')) {
      pathname = pathname.slice(0, -'/index.min.json'.length);
    }
    parsed.pathname = pathname || '/';

    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
}

export function isDuplicateRegistryUrl(candidate: string, existingUrls: string[]): boolean {
  const normalized = normalizeRegistryUrl(candidate);
  if (!normalized) return false;
  return existingUrls.some((url) => normalizeRegistryUrl(url) === normalized);
}

export function registryUrlsMatch(a: string, b: string): boolean {
  return normalizeRegistryUrl(a) === normalizeRegistryUrl(b);
}
