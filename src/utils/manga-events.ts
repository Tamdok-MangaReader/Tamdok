type Listener = () => void;

const NOTIFY_DELAY_MS = 60;

const listeners = new Set<Listener>();
let scheduled: ReturnType<typeof setTimeout> | null = null;

export function subscribeMangaData(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyMangaDataChanged(): void {
  if (scheduled !== null) return;
  scheduled = setTimeout(() => {
    scheduled = null;
    for (const listener of [...listeners]) {
      listener();
    }
  }, NOTIFY_DELAY_MS);
}
