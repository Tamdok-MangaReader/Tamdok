type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeSourceSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifySourceSettingsChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}
