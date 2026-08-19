type Listener = () => void;

const listeners = new Set<Listener>();
let appearanceVersion = 0;

export function subscribeAppearance(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAppearanceSnapshot(): number {
  return appearanceVersion;
}

export function notifyAppearanceChanged(): void {
  appearanceVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}
