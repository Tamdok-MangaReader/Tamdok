import { useCallback, useEffect, useRef } from "react";

/**
 * react-native-screens only reports focus/blur for the iOS search bar: closing an integrated search
 * with the X button emits no cancel/change event, so the query would stay applied behind the hidden
 * field. A blur that is not caused by the keyboard's Search key is treated as the search closing.
 */
export function useSearchBarReset(reset: () => void) {
  const searchPressedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetRef = useRef(reset);
  resetRef.current = reset;

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const onFocus = useCallback(() => {
    searchPressedRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onSearchPress = useCallback(() => {
    searchPressedRef.current = true;
  }, []);

  const onBlur = useCallback(() => {
    if (searchPressedRef.current) {
      searchPressedRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    // Short delay so a result tap that caused the blur still registers on the row.
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      resetRef.current();
    }, 250);
  }, []);

  return { onFocus, onBlur, onSearchPress };
}
