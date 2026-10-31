export function isNhentaiHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'nhentai.net' || host.endsWith('.nhentai.net');
  } catch {
    return false;
  }
}

// Never wait longer than this, even if the server asks for more.
const MAX_RETRY_AFTER_MS = 20_000;

// Parses a Retry-After header, which is either a number of seconds or an HTTP date.
export function parseRetryAfterMs(header?: string | null): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (!trimmed) return undefined;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    return seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : undefined;
  }
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    return delta > 0 ? Math.min(delta, MAX_RETRY_AFTER_MS) : undefined;
  }
  return undefined;
}

// +/-15% random spread so parallel requests do not all retry at the same instant.
function withJitter(ms: number): number {
  return Math.round(ms * (0.85 + Math.random() * 0.3));
}

// Backoff for retry `attempt` (1-based). Rate-limit statuses honour Retry-After or
// back off by 2s per attempt (capped at 12s); other failures back off by 1s per attempt.
export function retryDelayMs(status: number, attempt: number, retryAfterHeader?: string): number {
  if (status === 429 || status === 503) {
    const fromHeader = parseRetryAfterMs(retryAfterHeader);
    if (fromHeader != null) return withJitter(fromHeader);
    return withJitter(Math.min(2000 * attempt, 12_000));
  }
  return withJitter(1000 * attempt);
}
