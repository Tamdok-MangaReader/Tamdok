// Lets the first screen tell the root layout that its data is on screen, so the in-app splash can stay up until then.
let ready = false;
const listeners = new Set<() => void>();

export function markStartupReady(): void {
  if (ready) return;
  ready = true;
  for (const listener of listeners) listener();
}

export function isStartupReady(): boolean {
  return ready;
}

export function subscribeStartupReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
