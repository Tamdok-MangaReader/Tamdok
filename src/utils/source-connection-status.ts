import { useEffect, useState } from "react";

const TROUBLE_TTL_MS = 25_000;

const troubleAt = new Map<string, number>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function isTrouble(sourceId: string | undefined): boolean {
  if (!sourceId) return false;
  const at = troubleAt.get(sourceId);
  return at != null && Date.now() - at < TROUBLE_TTL_MS;
}

export function reportSourceTrouble(sourceId: string): void {
  troubleAt.set(sourceId, Date.now());
  emit();
}

export function reportSourceHealthy(sourceId: string): void {
  if (troubleAt.delete(sourceId)) emit();
}

export function useSourceTrouble(sourceId: string | undefined): boolean {
  const [active, setActive] = useState(() => isTrouble(sourceId));

  useEffect(() => {
    const update = () => setActive(isTrouble(sourceId));
    update();
    listeners.add(update);
    const timer = setInterval(update, 2000);
    return () => {
      listeners.delete(update);
      clearInterval(timer);
    };
  }, [sourceId]);

  return active;
}
