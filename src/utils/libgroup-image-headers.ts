import { DEFAULT_FETCH_USER_AGENT, NHENTAI_FETCH_USER_AGENT } from '@/parsers/shared/fetch-headers';
import type { InstalledSource } from '@/parsers/shared/types';

const LIBGROUP_SITE_IDS: Record<string, string> = {
  'ru.mangalib': '1',
  'ru.slashlib': '2',
  'ru.ranobelib': '3',
  'ru.hentailib': '4',
};

function isLibgroupSource(source: InstalledSource, settings: Record<string, unknown>): boolean {
  if (source.kind !== 'aidoku') return false;
  return typeof settings.apiUrl === 'string' && typeof settings.imageServerUrl === 'string';
}

function encodeBasicAuth(username: string, password: string): string {
  const value = `${username}:${password}`;
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(value);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }
  return '';
}

function resolveKomgaCoverHeaders(
  source: InstalledSource,
  settings: Record<string, unknown>,
): Record<string, string> | undefined {
  if (source.id !== 'server.komga.tamdok') return undefined;

  const headers: Record<string, string> = {};
  const apiKey = typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '';
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const username = typeof settings.username === 'string' ? settings.username.trim() : '';
  const password = typeof settings.password === 'string' ? settings.password : '';
  if (username && password) {
    headers.Authorization = `Basic ${encodeBasicAuth(username, password)}`;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function resolveLibgroupCoverHeaders(
  source: InstalledSource,
  settings: Record<string, unknown>,
): Record<string, string> | undefined {
  const komgaHeaders = resolveKomgaCoverHeaders(source, settings);
  if (komgaHeaders) return komgaHeaders;

  if (source.id.toLowerCase().includes('nhentai')) {
    return {
      Referer: 'https://nhentai.net/',
      Origin: 'https://nhentai.net',
      'User-Agent': NHENTAI_FETCH_USER_AGENT,
    };
  }

  if (!isLibgroupSource(source, settings)) return undefined;

  const siteId = LIBGROUP_SITE_IDS[source.id];
  if (!siteId) return undefined;

  const baseUrl = String(settings.baseUrl ?? source.manifest.info.url ?? '').replace(/\/$/, '');
  const apiUrl = String(settings.apiUrl ?? '').replace(/\/$/, '');
  if (!baseUrl || !apiUrl) return undefined;

  return {
    Origin: baseUrl,
    Referer: apiUrl,
    'Site-Id': siteId,
    'User-Agent': DEFAULT_FETCH_USER_AGENT,
  };
}
