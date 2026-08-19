import { registryUrlsMatch } from '@/utils/registry-url';

type PendingListener = () => void;

export const DEFAULT_REGISTRY_URL = 'https://tamdok-mangareader.github.io/sources/index.min.json';

let pendingRegistryUrl: string | null = null;
let promptingRegistryUrl: string | null = null;
const listeners = new Set<PendingListener>();

function urlsEqual(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a === b || registryUrlsMatch(a, b);
}

function decodeRegistryParam(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const decoded = decodeURIComponent(trimmed);
    new URL(decoded);
    return decoded;
  } catch {
    return null;
  }
}

function registryFromQuery(link: string): string | null {
  const queryIndex = link.indexOf('?');
  if (queryIndex === -1) return null;

  const query = link.slice(queryIndex + 1);
  for (const part of query.split('&')) {
    const [key, rawValue] = part.split('=');
    if (key !== 'registry' || !rawValue) continue;
    const decoded = decodeRegistryParam(rawValue);
    if (decoded) return decoded;
  }

  return null;
}

export function buildRegistrySettingsHref(registryUrl: string): `/settings/sources?registry=${string}` {
  return `/settings/sources?registry=${encodeURIComponent(registryUrl)}`;
}

export function buildRegistryDeepLink(registryUrl: string): string {
  return `tamdok://settings/sources?registry=${encodeURIComponent(registryUrl)}`;
}

export function parseRegistryFromRouteParam(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return decodeRegistryParam(value);
}

export function parseRegistryDeepLink(link: string): string | null {
  const trimmed = link.trim();
  if (!trimmed) return null;

  const fromQuery = registryFromQuery(trimmed);
  if (fromQuery) return fromQuery;

  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('tamdok://')) {
    return parseRegistryDeepLink(trimmed.slice('tamdok://'.length));
  }

  if (trimmed.startsWith('/settings/sources')) {
    return registryFromQuery(trimmed);
  }

  if (trimmed.startsWith('/https://') || trimmed.startsWith('/http://')) {
    return parseRegistryDeepLink(trimmed.slice(1));
  }

  if (trimmed.startsWith('//')) {
    return parseRegistryDeepLink(`https:${trimmed}`);
  }

  try {
    const parsed = new URL(trimmed, 'tamdok://app');
    const fromParsedQuery = parsed.searchParams.get('registry');
    if (fromParsedQuery) {
      const decoded = decodeRegistryParam(fromParsedQuery);
      if (decoded) return decoded;
    }

    if (parsed.protocol === 'tamdok:') {
      const host = parsed.hostname;
      const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      if (host === 'https' || host === 'http') {
        return parseRegistryDeepLink(`${host}:${path.startsWith('//') ? path : `//${path.replace(/^\//, '')}`}`);
      }
    }
  } catch {
    // Fall through.
  }

  return null;
}

const SAME_LINK_COOLDOWN_MS = 2500;
let lastClaimedUrl: string | null = null;
let lastClaimedAt = 0;

function isSameLinkOnCooldown(url: string): boolean {
  return urlsEqual(lastClaimedUrl, url) && Date.now() - lastClaimedAt < SAME_LINK_COOLDOWN_MS;
}

export function setPendingRegistryDeepLink(url: string): boolean {
  if (urlsEqual(promptingRegistryUrl, url) || urlsEqual(pendingRegistryUrl, url) || isSameLinkOnCooldown(url)) {
    return false;
  }

  pendingRegistryUrl = url;
  if (promptingRegistryUrl) return false;

  listeners.forEach((listener) => listener());
  return true;
}

export function peekPendingRegistryDeepLink(): string | null {
  return pendingRegistryUrl;
}

export function renotifyPendingRegistryDeepLink() {
  if (!pendingRegistryUrl || promptingRegistryUrl) return;
  listeners.forEach((listener) => listener());
}

export function claimRegistryDeepLink(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || promptingRegistryUrl || isSameLinkOnCooldown(trimmed)) return false;

  if (urlsEqual(pendingRegistryUrl, trimmed)) {
    pendingRegistryUrl = null;
  }

  promptingRegistryUrl = trimmed;
  lastClaimedUrl = trimmed;
  lastClaimedAt = Date.now();
  return true;
}

export function consumePendingRegistryDeepLink(): string | null {
  const url = pendingRegistryUrl;
  pendingRegistryUrl = null;
  return url;
}

export function finishRegistryDeepLinkPrompt() {
  if (!promptingRegistryUrl) return;

  lastClaimedUrl = promptingRegistryUrl;
  lastClaimedAt = Date.now();
  promptingRegistryUrl = null;
  if (!pendingRegistryUrl) return;
  listeners.forEach((listener) => listener());
}

export function subscribePendingRegistryDeepLink(listener: PendingListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
