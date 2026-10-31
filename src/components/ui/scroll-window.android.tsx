import { createContext, useContext } from "react";
import type { SharedValue } from "react-native-reanimated";

/**
 * Scroll state of the nearest windowed scroll view (see liquid-glass-scroll-root.android.tsx), used by
 * VirtualRows to mount only the rows near the viewport. `nodeRef` is the host ScrollView.
 */
export type ScrollWindow = {
  scrollY: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  getNode: () => unknown;
};

export const ScrollWindowContext = createContext<ScrollWindow | null>(null);

export function useScrollWindow(): ScrollWindow | null {
  return useContext(ScrollWindowContext);
}
