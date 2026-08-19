/** Safari on iPhone — closer to a real browser than Aidoku/CFNetwork for CDN checks. */
export const DEFAULT_FETCH_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** Same UA string as Aidoku nhentai WASM source (Google app WebView). */
export const NHENTAI_FETCH_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/300.0.598994205 Mobile/15E148 Safari/604';

function isNhentaiUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'nhentai.net' || host.endsWith('.nhentai.net');
  } catch {
    return false;
  }
}

export function buildFetchHeaders(
  url: string,
  sourceHeaders: Record<string, string> = {},
  sourceBaseUrl?: string,
): Record<string, string> {
  const nhentai = isNhentaiUrl(url);
  const headers: Record<string, string> = {
    'User-Agent': nhentai ? NHENTAI_FETCH_USER_AGENT : DEFAULT_FETCH_USER_AGENT,
    Accept: nhentai ? 'application/json,text/plain,*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    ...sourceHeaders,
  };

  if (nhentai) {
    headers.Referer = 'https://nhentai.net/';
    headers.Origin = 'https://nhentai.net';
  }

  const hasReferer = Object.keys(headers).some((key) => key.toLowerCase() === 'referer');
  const referer = hasReferer ? undefined : resolveReferer(url, sourceBaseUrl);
  if (referer) {
    headers.Referer = referer;
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'origin')) {
      headers.Origin = new URL(referer).origin;
    }
  }

  return headers;
}

export function resolveSourceBaseUrl(manifest: { info: { url?: string; urls?: string[] } }): string | undefined {
  return manifest.info.url ?? manifest.info.urls?.[0];
}

function resolveReferer(url: string, sourceBaseUrl?: string): string | undefined {
  if (sourceBaseUrl) {
    try {
      return new URL(sourceBaseUrl).origin + '/';
    } catch {
      // fall through
    }
  }

  try {
    return new URL(url).origin + '/';
  } catch {
    return undefined;
  }
}
