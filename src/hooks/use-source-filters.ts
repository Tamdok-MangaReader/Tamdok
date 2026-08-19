import { useEffect, useState } from 'react';

import { defaultFilterValues, mergeFilterValues } from '@/parsers/shared/filters';
import type { FilterDefinition, FilterValue, InstalledSource } from '@/parsers/shared/types';
import type { SourceRunner } from '@/parsers/shared/source-runner';

export function useSourceFilters(runner: SourceRunner | null) {
  const [definitions, setDefinitions] = useState<FilterDefinition[]>([]);
  const [values, setValues] = useState<FilterValue[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(runner?.getFilters));

  useEffect(() => {
    if (!runner?.getFilters) {
      setDefinitions([]);
      setValues([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    runner
      .getFilters()
      .then((nextDefinitions) => {
        if (cancelled) return;
        setDefinitions(nextDefinitions);
        setValues((current) => mergeFilterValues(current, nextDefinitions));
      })
      .catch(() => {
        if (!cancelled) {
          setDefinitions([]);
          setValues([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runner?.sourceId]);

  const resetValues = () => {
    setValues(defaultFilterValues(definitions));
  };

  return { definitions, values, setValues, resetValues, isLoading };
}

export function sourceWebsiteUrl(source: InstalledSource | undefined): string | undefined {
  if (!source) return undefined;
  const info = source.manifest.info;
  return info.url ?? info.urls?.[0];
}
