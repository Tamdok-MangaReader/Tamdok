import { useMemo } from "react";

import { useSources } from "@/context/sources-context";

/** True only when installed sources come from more than one engine (Aidoku and Tamdok), so the kind label is informative. */
export function useMultipleSourceKinds(): boolean {
  const { installed } = useSources();
  return useMemo(() => new Set(installed.map((source) => source.kind)).size > 1, [installed]);
}
