export function isNhentaiHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'nhentai.net' || host.endsWith('.nhentai.net');
  } catch {
    return false;
  }
}

const MAX_RETRY_AFTER_MS = 20_000;

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

function withJitter(ms: number): number {
  return Math.round(ms * (0.85 + Math.random() * 0.3));
}

export function retryDelayMs(status: number, attempt: number, retryAfterHeader?: string): number {
  if (status === 429 || status === 503) {
    const fromHeader = parseRetryAfterMs(retryAfterHeader);
    if (fromHeader != null) return withJitter(fromHeader);
    return withJitter(Math.min(2000 * attempt, 12_000));
  }
  return withJitter(1000 * attempt);
}
