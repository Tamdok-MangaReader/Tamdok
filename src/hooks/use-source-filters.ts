import { useEffect, useRef, useState } from 'react';

import { getValue, setValue } from '@/constants/storage';

import { defaultFilterValues, mergeFilterValues } from '@/parsers/shared/filters';
import type { FilterDefinition, FilterValue, InstalledSource } from '@/parsers/shared/types';
import type { SourceRunner } from '@/parsers/shared/source-runner';

const storageKey = (sourceId: string) => `source_filters_v1_${sourceId}`;

/** Filter values are remembered per source and restored the next time that source is opened. */
export function useSourceFilters(runner: SourceRunner | null) {
  const [definitions, setDefinitions] = useState<FilterDefinition[]>([]);
  const [values, setValues] = useState<FilterValue[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(runner?.getFilters));
  const hydrated = useRef(false);
  const lastSaved = useRef<string | null>(null);

  useEffect(() => {
    if (!runner?.getFilters) {
      setDefinitions([]);
      setValues([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    hydrated.current = false;
    lastSaved.current = null;
    setIsLoading(true);

    Promise.all([
      runner.getFilters(),
      getValue<FilterValue[] | null>(storageKey(runner.sourceId), null).catch(() => null),
    ])
      .then(([nextDefinitions, saved]) => {
        if (cancelled) return;
        setDefinitions(nextDefinitions);
        setValues((current) =>
          mergeFilterValues(Array.isArray(saved) && saved.length > 0 ? saved : current, nextDefinitions),
        );
        hydrated.current = true;
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

  useEffect(() => {
    if (!runner || !hydrated.current) return;
    const sourceId = runner.sourceId;
    const json = JSON.stringify(values);
    // The first values after loading are what is already stored, so only later changes are written.
    if (lastSaved.current === null) {
      lastSaved.current = json;
      return;
    }
    if (json === lastSaved.current) return;
    const timer = setTimeout(() => {
      lastSaved.current = json;
      void setValue(storageKey(sourceId), values);
    }, 300);
    return () => clearTimeout(timer);
  }, [values, runner?.sourceId]);

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
