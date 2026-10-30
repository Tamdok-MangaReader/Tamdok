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
  return '';
}

function resolveServerCoverHeaders(source: InstalledSource, settings: Record<string, unknown>): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  const text = (key: string) => (typeof settings[key] === 'string' ? (settings[key] as string).trim() : '');

  switch (source.id) {
    case 'server.komga.tamdok': {
      const apiKey = text('apiKey');
      if (apiKey) headers['X-API-Key'] = apiKey;
      break;
    }
    case 'server.lanraragi.tamdok': {
      const apiKey = text('apiKey');
      if (apiKey && typeof globalThis.btoa === 'function') headers.Authorization = `Bearer ${globalThis.btoa(apiKey)}`;
      return Object.keys(headers).length > 0 ? headers : undefined;
    }
    case 'server.suwayomi.tamdok':
      break;
    default:
      return undefined;
  }

  const username = text('username');
  const password = typeof settings.password === 'string' ? settings.password : '';
  if (username && password) {
    headers.Authorization = `Basic ${encodeBasicAuth(username, password)}`;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function resolveLibgroupCoverHeaders(source: InstalledSource, settings: Record<string, unknown>): Record<string, string> | undefined {
  const serverHeaders = resolveServerCoverHeaders(source, settings);
  if (serverHeaders) return serverHeaders;

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
