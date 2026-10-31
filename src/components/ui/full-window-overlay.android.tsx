import type { ReactNode } from "react";

// Android: FullWindowOverlay is iOS-only; a RN Modal already covers the whole window.
export function FullWindowOverlay({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
