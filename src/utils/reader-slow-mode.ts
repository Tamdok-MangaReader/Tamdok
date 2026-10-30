import { useEffect, useState, useSyncExternalStore } from "react";

const SLOW_INTERVAL_MS = 700;

let enabled = false;
let nextSlot = 0;
const listeners = new Set<() => void>();

export function setReaderSlowMode(value: boolean): void {
  if (enabled === value) return;
  enabled = value;
  nextSlot = 0;
  listeners.forEach((listener) => listener());
}

export function isReaderSlowMode(): boolean {
  return enabled;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReaderSlowMode(): boolean {
  return useSyncExternalStore(subscribe, isReaderSlowMode, isReaderSlowMode);
}

export function waitForSlowTurn(): Promise<void> {
  if (!enabled) return Promise.resolve();
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + SLOW_INTERVAL_MS;
  const wait = at - now;
  if (wait <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, wait));
}

export function useSlowRelease(key: string | undefined): boolean {
  const slow = useReaderSlowMode();
  const [released, setReleased] = useState(false);

  useEffect(() => {
    if (!slow) {
      setReleased(true);
      return;
    }
    let cancelled = false;
    setReleased(false);
    void waitForSlowTurn().then(() => {
      if (!cancelled) setReleased(true);
    });
    return () => {
      cancelled = true;
    };
  }, [slow, key]);

  return !slow || released;
}
