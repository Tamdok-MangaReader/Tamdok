import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

/**
 * Counter that changes when native glass views may have lost their effect: the app returns to the
 * foreground, or the controls come back after being hidden for a long time. Use it as a React `key`
 * to recreate the glass views, because the native view applies its effect only once per mount.
 * `resetKey` (for example the open chapter) also bumps it when it changes: loading another chapter re-renders
 * the content behind the controls, which can leave the glass views blank.
 */
export function useGlassEpoch(visible: boolean, staleAfterMs = 20_000, resetKey?: string): number {
  const [epoch, setEpoch] = useState(0);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setEpoch((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  const previousKey = useRef(resetKey);
  useEffect(() => {
    if (previousKey.current === resetKey) return;
    previousKey.current = resetKey;
    setEpoch((value) => value + 1);
    // Layout keeps settling after a chapter load, and a glass view created before that can end up blank:
    // rebuild once more when it is done.
    const timer = setTimeout(() => setEpoch((value) => value + 1), 400);
    return () => clearTimeout(timer);
  }, [resetKey]);

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
