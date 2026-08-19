export function isAnimatedCoverUri(uri: string): boolean {
  const normalized = uri.split('?')[0]?.split('#')[0]?.toLowerCase() ?? '';
  return normalized.endsWith('.gif');
}

export function isLocalImageUri(uri: string): boolean {
  return (
    uri.startsWith('file:') ||
    uri.startsWith('data:') ||
    uri.startsWith('blob:') ||
    uri.startsWith('/')
  );
}

export function normalizeImageUri(uri: string): string {
  if (uri.startsWith('//')) return `https:${uri}`;
  if (uri.startsWith('/') && !uri.startsWith('file:')) return `file://${uri}`;
  return uri;
}

export function coverImageSource(uri: string, headers?: Record<string, string>) {
  const normalized = normalizeImageUri(uri);
  const local = isLocalImageUri(normalized);
  const hasHeaders = !local && headers && Object.keys(headers).length > 0;
  return {
    uri: normalized,
    ...(hasHeaders ? { headers } : {}),
    ...(isAnimatedCoverUri(normalized) ? { isAnimated: true as const } : {}),
  };
}
