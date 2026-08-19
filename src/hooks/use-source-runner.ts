import { useEffect, useState } from 'react';

import type { InstalledSource } from '@/parsers/shared/types';
import type { SourceRunner } from '@/parsers/shared/source-runner';
import { getOrCreateSourceRunner } from '@/services/sources';

export function useSourceRunner(source: InstalledSource | undefined) {
  const [runner, setRunner] = useState<SourceRunner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(source));

  useEffect(() => {
    if (!source) {
      setRunner(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getOrCreateSourceRunner(source)
      .then((nextRunner) => {
        if (!cancelled) setRunner(nextRunner);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
          setRunner(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [source?.kind, source?.id]);

  return { runner, error, isLoading };
}
