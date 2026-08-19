type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeAppSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyAppSettingsChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}
