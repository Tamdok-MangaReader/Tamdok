import { useCallback, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

export function useNearEnd(onNearEnd: () => void, threshold = 1.5) {
  const callbackRef = useRef(onNearEnd);
  callbackRef.current = onNearEnd;

  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } =
        event.nativeEvent;
      const remaining =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      if (remaining < layoutMeasurement.height * threshold) {
        callbackRef.current();
      }
    },
    [threshold],
  );
}
