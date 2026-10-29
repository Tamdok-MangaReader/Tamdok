import { useCallback, useReducer, useRef } from "react";
import { useHeaderHeight } from "@react-navigation/elements";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAB_BAR_HEIGHT = 49;

export function usePagerHeights(pageIds: readonly string[], selectedIndex: number) {
  const { height: windowHeight } = useWindowDimensions();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const minHeight = Math.max(
    windowHeight - headerHeight - insets.bottom - TAB_BAR_HEIGHT,
    0,
  );
  const [, bump] = useReducer((value: number) => value + 1, 0);
  const heights = useRef<Record<string, number>>({});
  const selectedId = pageIds[selectedIndex] ?? "";
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const onHeight = useCallback((id: string, height: number) => {
    if (Math.abs((heights.current[id] ?? 0) - height) < 1) return;
    heights.current[id] = height;
    if (id === selectedRef.current) bump();
  }, []);

  const pagerHeight = Math.max(heights.current[selectedId] ?? 0, minHeight);

  return { pagerHeight, onHeight };
}
