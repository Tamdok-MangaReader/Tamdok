import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { InstalledSource } from '@/parsers/shared/types';
import { getEffectiveSourceSettings } from '@/services/source-settings';
import { subscribeSourceSettings } from '@/utils/source-settings-events';
import { resolveLibgroupCoverHeaders } from '@/utils/libgroup-image-headers';

type CoverHeadersContextValue = {
  headers: Record<string, string> | undefined;
  ready: boolean;
};

const SourceCoverHeadersContext = createContext<CoverHeadersContextValue>({
  headers: undefined,
  ready: true,
});

type SourceCoverHeadersProviderProps = {
  source: InstalledSource | undefined;
  children: ReactNode;
};

export function SourceCoverHeadersProvider({ source, children }: SourceCoverHeadersProviderProps) {
  const [headers, setHeaders] = useState<Record<string, string> | undefined>(undefined);
  const [ready, setReady] = useState(!source);

  useEffect(() => {
    if (!source) {
      setHeaders(undefined);
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);

    getEffectiveSourceSettings(source)
      .then((settings) => {
        if (cancelled) return;
        setHeaders(resolveLibgroupCoverHeaders(source, settings));
      })
      .catch(() => {
        if (cancelled) return;
        setHeaders(undefined);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    const unsubscribe = subscribeSourceSettings(() => {
      void getEffectiveSourceSettings(source).then((settings) => {
        if (!cancelled) setHeaders(resolveLibgroupCoverHeaders(source, settings));
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [source?.id, source?.kind]);

  const value = useMemo(() => ({ headers, ready }), [headers, ready]);

  return <SourceCoverHeadersContext.Provider value={value}>{children}</SourceCoverHeadersContext.Provider>;
}

export function useSourceCoverHeaders(): Record<string, string> | undefined {
  return useContext(SourceCoverHeadersContext).headers;
}

export function useSourceCoverHeadersReady(): boolean {
  return useContext(SourceCoverHeadersContext).ready;
}
