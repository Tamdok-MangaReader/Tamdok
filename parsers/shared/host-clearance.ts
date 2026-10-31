import * as SecureStore from 'expo-secure-store';

// Cloudflare "clearance" captured from a WebView after the user passed a browser check.
// The cookies are only valid together with the same User-Agent, so both are stored.
export type HostClearance = {
  cookies: Record<string, string>;
  userAgent: string;
  savedAt: number;
};

// SecureStore has no "list keys" API, so the set of hosts is kept in a separate index entry.
const INDEX_KEY = 'cf_clearance_hosts';

// In-memory mirror of the SecureStore contents so lookups on the hot request path stay synchronous.
const memory = new Map<string, HostClearance>();
const listeners = new Set<() => void>();
let loadPromise: Promise<void> | null = null;

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function normalizeClearanceHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

// SecureStore keys only allow [A-Za-z0-9._-]; anything else in the host is replaced.
function storageKey(host: string): string {
  return `cf_clearance.${host.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeClearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Lazily loads every stored clearance once; later calls reuse the same promise.
// Loading errors are swallowed on purpose: a missing clearance only means requests go out without it.
export function ensureClearanceLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await SecureStore.getItemAsync(INDEX_KEY);
        const hosts = raw ? (JSON.parse(raw) as string[]) : [];
        await Promise.all(
          hosts.map(async (host) => {
            const value = await SecureStore.getItemAsync(storageKey(host));
            if (value) memory.set(host, JSON.parse(value) as HostClearance);
          }),
        );
      } catch {
        return;
      }
    })();
  }
  return loadPromise;
}

async function persistIndex(): Promise<void> {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify([...memory.keys()]));
}

// Walks up the domain (a.b.example.com -> b.example.com -> example.com) so a clearance
// saved for the parent domain also applies to its subdomains. The loop stops before the bare TLD.
export function findHostClearance(host: string): HostClearance | undefined {
  let candidate = normalizeClearanceHost(host);
  while (candidate.includes('.')) {
    const hit = memory.get(candidate);
    if (hit) return hit;
    candidate = candidate.slice(candidate.indexOf('.') + 1);
  }
  return undefined;
}

export function hasHostClearance(host: string): boolean {
  return findHostClearance(host) != null;
}

export async function saveHostClearance(host: string, clearance: HostClearance): Promise<void> {
  await ensureClearanceLoaded();
  const key = normalizeClearanceHost(host);
  memory.set(key, clearance);
  await SecureStore.setItemAsync(storageKey(key), JSON.stringify(clearance));
  await persistIndex();
  notify();
}

// Removes the clearance for the host and for every parent domain it could have matched.
export async function removeHostClearance(host: string): Promise<void> {
  await ensureClearanceLoaded();
  let candidate = normalizeClearanceHost(host);
  while (candidate.includes('.')) {
    if (memory.delete(candidate)) {
      await SecureStore.deleteItemAsync(storageKey(candidate)).catch(() => undefined);
    }
    candidate = candidate.slice(candidate.indexOf('.') + 1);
  }
  await persistIndex().catch(() => undefined);
  notify();
}

// Returns the cookie names already present in a Cookie header.
function parseCookieHeader(value: string): Set<string> {
  const names = new Set<string>();
  for (const part of value.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (name) names.add(name);
  }
  return names;
}

// Returns request headers with the stored clearance applied: forces the matching User-Agent
// and appends clearance cookies without overriding cookies the source already set.
export function withClearance(url: string, headers: Record<string, string>): Record<string, string> {
  const clearance = findHostClearance(hostFromUrl(url));
  if (!clearance) return headers;

  const next: Record<string, string> = { ...headers };
  const userAgentKey = Object.keys(next).find((key) => key.toLowerCase() === 'user-agent');
  next[userAgentKey ?? 'User-Agent'] = clearance.userAgent;

  const cookieKey = Object.keys(next).find((key) => key.toLowerCase() === 'cookie');
  const existing = cookieKey ? next[cookieKey]! : '';
  const present = parseCookieHeader(existing);
  const additions = Object.entries(clearance.cookies)
    .filter(([name]) => !present.has(name))
    .map(([name, value]) => `${name}=${value}`);

  if (additions.length > 0) {
    const joined = existing ? `${existing.replace(/;\s*$/, '')}; ${additions.join('; ')}` : additions.join('; ');
    next[cookieKey ?? 'Cookie'] = joined;
  }
  return next;
}
