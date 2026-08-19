import { useCallback, useEffect, useState } from 'react';

import { subscribeMangaData } from '@/utils/manga-events';

export function useMangaDataRefresh(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeMangaData(() => setTick((value) => value + 1)), []);
  return tick;
}

export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []): { data: T | null; reload: () => void } {
  const refresh = useMangaDataRefresh();
  const [data, setData] = useState<T | null>(null);

  const reload = useCallback(() => {
    void loader().then(setData);
  }, deps);

  useEffect(() => {
    void loader().then(setData);
  }, [reload, refresh]);

  return { data, reload };
}
