import { useEffect } from 'react';

import { releaseAidokuSourceRequests, retainAidokuSourceRequests } from '@/parsers/aidoku/wasm-bridge';
import { releaseTamdokSourceRequests, retainTamdokSourceRequests } from '@/parsers/tamdok/runtime';

export function useAidokuSourceRequests(sourceId: string | undefined, enabled = true) {
  useEffect(() => {
    if (!enabled || !sourceId) return;
    retainAidokuSourceRequests(sourceId);
    retainTamdokSourceRequests(sourceId);
    return () => {
      releaseAidokuSourceRequests(sourceId);
      releaseTamdokSourceRequests(sourceId);
    };
  }, [enabled, sourceId]);
}
