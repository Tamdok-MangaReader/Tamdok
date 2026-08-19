type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeMangaData(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyMangaDataChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}
