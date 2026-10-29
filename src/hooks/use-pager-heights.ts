import { useCallback, useReducer, useRef } from "react";
import { useWindowDimensions } from "react-native";

export function usePagerHeights(pageIds: readonly string[], selectedIndex: number) {
  const { height: windowHeight } = useWindowDimensions();
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

  const pagerHeight = Math.max(heights.current[selectedId] ?? 0, windowHeight * 0.6);

  return { pagerHeight, onHeight };
}
