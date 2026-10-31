import { parseRetryAfterMs } from './fetch-rate-limit';
import { hostFromUrl } from './host-clearance';

// Upper bound for the adaptive extra delay added after rate-limit responses.
const MAX_PENALTY_MS = 2500;
// Upper bound for honouring a server's Retry-After header.
const MAX_COOLDOWN_MS = 20_000;

// Per-host throttle state.
// `queue` serialises requests, `penaltyMs` is the adaptive extra gap and
// `cooldownUntil` is a hard "do not send before" timestamp from Retry-After.
type HostState = {
  queue: Promise<void>;
  lastAt: number;
  penaltyMs: number;
  cooldownUntil: number;
};

const hostStates = new Map<string, HostState>();

// Minimum gap between two requests to a host. Hosts known to rate limit aggressively
// get a non-zero value; everything else is unthrottled.
export function baseGapForHost(host: string): number {
  if (
    host.includes('cdnlibs') ||
    host.includes('mangalib') ||
    host.includes('imglib') ||
    host.includes('lib.social') ||
    host.includes('hentailib') ||
    host.includes('slashlib')
  ) {
    return 250;
  }
  if (host.includes('nhentai')) return 200;
  if (host.includes('mangadex')) return 220;
  if (host.includes('senkuro') || host.includes('senkognito')) return 250;
  if (host.includes('remanga')) return 200;
  if (host.includes('asura')) return 150;
  return 0;
}

function stateFor(host: string): HostState {
  let state = hostStates.get(host);
  if (!state) {
    state = { queue: Promise.resolve(), lastAt: 0, penaltyMs: 0, cooldownUntil: 0 };
    hostStates.set(host, state);
  }
  return state;
}

export function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

// Serialises requests per host: each caller chains onto the previous caller's promise,
// then sleeps until the host's gap/cooldown allows it. Aborted callers release the
// slot immediately so they never block the queue.
export async function acquireHostSlot(url: string, signal?: AbortSignal): Promise<void> {
  const host = hostFromUrl(url);
  if (!host) return;
  const state = stateFor(host);
  const previous = state.queue;
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.queue = previous
    .catch(() => undefined)
    .then(async () => {
      if (signal?.aborted) {
        release();
        return;
      }
      const gap = baseGapForHost(host) + state.penaltyMs;
      const now = Date.now();
      const wait = Math.max(gap - (now - state.lastAt), state.cooldownUntil - now);
      if (wait > 0) await pause(wait, signal);
      if (!signal?.aborted) state.lastAt = Date.now();
      release();
    });
  await current;
}

// Adaptive throttling: 429/503 doubles the penalty (and honours Retry-After);
// successful responses decay the penalty by ~30% until it drops to zero.
export function reportHostResponse(url: string, status: number, retryAfterHeader?: string | null): void {
  const host = hostFromUrl(url);
  if (!host) return;
  const state = stateFor(host);
  if (status === 429 || status === 503) {
    const base = baseGapForHost(host);
    state.penaltyMs = Math.min(MAX_PENALTY_MS, Math.max(base * 2, state.penaltyMs * 2, 250));
    const retryAfter = parseRetryAfterMs(retryAfterHeader);
    if (retryAfter != null) {
      state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + Math.min(retryAfter, MAX_COOLDOWN_MS));
    }
    return;
  }
  if (status < 400 && state.penaltyMs > 0) {
    const decayed = Math.floor(state.penaltyMs * 0.7);
    state.penaltyMs = decayed < 50 ? 0 : decayed;
  }
}

export function resetHostThrottle(hosts?: string[]): void {
  if (!hosts) {
    hostStates.clear();
    return;
  }
  for (const host of hosts) {
    for (const key of [...hostStates.keys()]) {
      if (hostsRelated(key, host)) hostStates.delete(key);
    }
  }
}

function stripWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

// Two hosts are related when one is a subdomain of the other (ignoring www.).
export function hostsRelated(a: string, b: string): boolean {
  const left = stripWww(a);
  const right = stripWww(b);
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

// Hosts that recently answered with a Cloudflare challenge. Listeners are notified
// on change so the UI can show the "Cloudflare check" prompt.
const challengedHosts = new Set<string>();
const challengeListeners = new Set<() => void>();

export function subscribeChallenges(listener: () => void): () => void {
  challengeListeners.add(listener);
  return () => {
    challengeListeners.delete(listener);
  };
}

export function isHostChallenged(host: string): boolean {
  const target = stripWww(host);
  for (const entry of challengedHosts) {
    if (hostsRelated(entry, target)) return true;
  }
  return false;
}

export function markHostChallenged(host: string): void {
  const key = stripWww(host);
  if (challengedHosts.has(key)) return;
  challengedHosts.add(key);
  for (const listener of challengeListeners) listener();
}

export function clearHostChallenge(host: string): void {
  const target = stripWww(host);
  let changed = false;
  for (const entry of [...challengedHosts]) {
    if (hostsRelated(entry, target)) {
      challengedHosts.delete(entry);
      changed = true;
    }
  }
  if (changed) for (const listener of challengeListeners) listener();
}

// Substrings found in Cloudflare's interstitial pages.
const CHALLENGE_BODY_MARKERS = ['just a moment', 'cf-chl', 'challenge-platform', 'attention required', 'cf-browser-verification'];

// Heuristic: a 403/503/429 from a Cloudflare server whose body looks like the
// interstitial, or one that carries the explicit cf-mitigated: challenge header.
export function looksLikeCloudflareChallenge(
  status: number,
  headers: Record<string, string>,
  body: string,
): boolean {
  if (status !== 403 && status !== 503 && status !== 429) return false;
  if ((headers['cf-mitigated'] ?? '').toLowerCase() === 'challenge') return true;
  const server = (headers.server ?? '').toLowerCase();
  if (!server.includes('cloudflare')) return false;
  const head = body.slice(0, 6000).toLowerCase();
  return CHALLENGE_BODY_MARKERS.some((marker) => head.includes(marker));
}

// Tiny in-memory LRU cache for GET responses. It exists to collapse bursts of identical
// requests (for example several parsers asking for the same page), not to be a real HTTP cache.
type CachedResponse = {
  expiresAt: number;
  host: string;
  status: number;
  url: string;
  body: string;
  headers: Record<string, string>;
};

const MAX_CACHE_ENTRIES = 48;
const MAX_CACHED_BODY_CHARS = 2_000_000;
const DEFAULT_CACHE_TTL_MS = 10_000;
const NHENTAI_CACHE_TTL_MS = 90_000;

const responseCache = new Map<string, CachedResponse>();

export function cacheTtlFor(url: string): number {
  return hostFromUrl(url).includes('nhentai') ? NHENTAI_CACHE_TTL_MS : DEFAULT_CACHE_TTL_MS;
}

// Reading refreshes the entry (delete + set) to keep Map iteration order == LRU order.
export function readResponseCache(key: string): Omit<CachedResponse, 'expiresAt' | 'host'> | undefined {
  const hit = responseCache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return undefined;
  }
  responseCache.delete(key);
  responseCache.set(key, hit);
  return { status: hit.status, url: hit.url, body: hit.body, headers: hit.headers };
}

// Only successful, reasonably small responses that do not forbid storing are cached.
// Oldest entries are evicted first.
export function writeResponseCache(
  key: string,
  url: string,
  value: { status: number; url: string; body: string; headers: Record<string, string> },
): void {
  if (value.status !== 200 || value.body.length > MAX_CACHED_BODY_CHARS) return;
  if ((value.headers['cache-control'] ?? '').toLowerCase().includes('no-store')) return;
  responseCache.delete(key);
  responseCache.set(key, { ...value, host: hostFromUrl(url), expiresAt: Date.now() + cacheTtlFor(url) });
  while (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest === undefined) break;
    responseCache.delete(oldest);
  }
}

// Called after any non-GET request: the mutation may change what GETs return.
export function invalidateResponseCacheForHost(url: string): void {
  const host = hostFromUrl(url);
  for (const [key, entry] of [...responseCache.entries()]) {
    if (hostsRelated(entry.host, host)) responseCache.delete(key);
  }
}

export function clearResponseCache(hosts?: string[]): void {
  if (!hosts) {
    responseCache.clear();
    return;
  }
  for (const [key, entry] of [...responseCache.entries()]) {
    if (hosts.some((host) => hostsRelated(entry.host, host))) responseCache.delete(key);
  }
}
