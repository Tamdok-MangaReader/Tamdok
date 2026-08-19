export function isNhentaiHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'nhentai.net' || host.endsWith('.nhentai.net');
  } catch {
    return false;
  }
}

/** Backoff after HTTP 429 — mirrors Aidoku downloader (Retry-After, then exponential). */
export function retryDelayMs(status: number, attempt: number, retryAfterHeader?: string): number {
  if (status === 429) {
    const parsed = Number(retryAfterHeader);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed * 1000, 15_000);
    }
    return Math.min(2000 * attempt, 12_000);
  }
  return 1000 * attempt;
}
