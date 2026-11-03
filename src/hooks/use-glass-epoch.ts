import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

/**
 * Counter that changes when native glass views may have lost their effect: the app returns to the
 * foreground, or the controls come back after being hidden for a long time. Use it as a React `key`
 * to recreate the glass views, because the native view applies its effect only once per mount.
 */
export function useGlassEpoch(visible: boolean, staleAfterMs = 20_000): number {
  const [epoch, setEpoch] = useState(0);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setEpoch((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!visible) {
      hiddenAt.current ??= Date.now();
      return;
    }
    const since = hiddenAt.current;
    hiddenAt.current = null;
    if (since !== null && Date.now() - since >= staleAfterMs) {
      setEpoch((value) => value + 1);
    }
  }, [visible, staleAfterMs]);

  return epoch;
}
