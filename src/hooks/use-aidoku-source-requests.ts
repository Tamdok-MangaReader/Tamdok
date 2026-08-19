import { useEffect } from 'react';

import { releaseAidokuSourceRequests, retainAidokuSourceRequests } from '@/parsers/aidoku/wasm-bridge';

export function useAidokuSourceRequests(sourceId: string | undefined, enabled = true) {
  useEffect(() => {
    if (!enabled || !sourceId) return;
    retainAidokuSourceRequests(sourceId);
    return () => {
      releaseAidokuSourceRequests(sourceId);
    };
  }, [enabled, sourceId]);
}
