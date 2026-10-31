import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useAnimatedReaction, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useScrollWindow } from "@/components/ui/scroll-window.android";

// Android implementation of VirtualRows. React Native's private VirtualView crashes on Android
// ("Map already consumed"), so windowing is done in JS instead: the surrounding scroll view
// (LiquidGlassScrollComponent) publishes its scroll offset, and only rows within about one viewport of
// the visible area stay mounted. The others are replaced by empty views of the same height, so the
// total height, the gaps and the scroll position stay stable. Same API as the iOS implementation.

type Measurable = {
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void;
};

const RANGE_BASE = 1_000_000;
const INITIAL_ROWS = 10;
const HEIGHT_EPSILON = 0.5;

// Kept for API parity with the iOS file (rows are wrapped by VirtualRows itself on Android).
export const VirtualRow = memo(function VirtualRow({ children }: { height: number; children: ReactNode }) {
  return <View>{children}</View>;
});

type VirtualRowsProps<T> = {
  rows: readonly T[];
  rowHeight: number | ((row: T) => number);
  keyOf: (row: T) => string;
  renderRow: (row: T) => ReactNode;
  pageId: string;
  onHeight: (pageId: string, height: number) => void;
  style?: StyleProp<ViewStyle>;
  footer?: ReactNode;
};

export function VirtualRows<T>({
  rows,
  rowHeight,
  keyOf,
  renderRow,
  pageId,
  onHeight,
  style,
  footer,
}: VirtualRowsProps<T>) {
  const scrollWindow = useScrollWindow();
  // The project's react-native typings do not expose measureInWindow on View refs.
  const containerRef = useRef<Measurable>(null);

  const flat = StyleSheet.flatten(style) ?? {};
  const gap = Number(flat.rowGap ?? flat.gap ?? 0);
  const paddingTop = Number(flat.paddingTop ?? flat.paddingVertical ?? flat.padding ?? 0);

  // Real heights of rows that have been mounted; estimates are used until then.
  const measured = useRef(new Map<string, number>());
  const [version, setVersion] = useState(0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportHeight = useCallback((key: string, height: number) => {
    const previous = measured.current.get(key);
    if (previous !== undefined && Math.abs(previous - height) < HEIGHT_EPSILON) return;
    measured.current.set(key, height);
    if (flushTimer.current) return;
    // Batch many row measurements into one re-render.
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      setVersion((value) => value + 1);
    }, 60);
  }, []);

  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    },
    [],
  );

  const heights = useMemo(
    () =>
      rows.map(
        (row) =>
          measured.current.get(keyOf(row)) ??
          (typeof rowHeight === "number" ? rowHeight : rowHeight(row)),
      ),
    // `version` invalidates the memo when new measurements arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, rowHeight, keyOf, version],
  );

  // Start y of every row relative to the container's top (+ one trailing entry for the end).
  const offsets = useMemo(() => {
    const out: number[] = new Array(rows.length + 1);
    let y = paddingTop;
    for (let i = 0; i < rows.length; i++) {
      out[i] = y;
      y += heights[i]! + gap;
    }
    out[rows.length] = y;
    return out;
  }, [rows.length, heights, gap, paddingTop]);

  const offsetsSV = useSharedValue<number[]>([]);
  const containerY = useSharedValue(0);
  useEffect(() => {
    offsetsSV.value = offsets;
  }, [offsets, offsetsSV]);

  const [range, setRange] = useState({ start: 0, end: INITIAL_ROWS });
  const applyRange = useCallback((start: number, end: number) => {
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  // Position of the container inside the scroll content (changes when content above it changes).
  const measureContainer = useCallback(() => {
    if (!scrollWindow) return;
    const container = containerRef.current;
    const scroller = scrollWindow.getNode() as Measurable | null;
    if (!container || !scroller?.measureInWindow) return;
    container.measureInWindow((_x, containerWindowY) => {
      scroller.measureInWindow((_sx, scrollWindowY) => {
        containerY.value = containerWindowY - scrollWindowY + scrollWindow.scrollY.value;
      });
    });
  }, [scrollWindow, containerY]);

  useAnimatedReaction(
    () => {
      if (!scrollWindow) return -1;
      const offs = offsetsSV.value;
      const count = offs.length - 1;
      if (count <= 0) return 0;
      const viewport = scrollWindow.viewportHeight.value || 800;
      const top = scrollWindow.scrollY.value - containerY.value;
      const low = top - viewport;
      const high = top + viewport * 2;
      // First row whose bottom edge is below `low`.
      let a = 0;
      let b = count;
      while (a < b) {
        const mid = (a + b) >> 1;
        if (offs[mid + 1]! <= low) a = mid + 1;
        else b = mid;
      }
      const start = a;
      // Last row whose top edge is above `high`.
      let c = start;
      let d = count - 1;
      while (c < d) {
        const mid = (c + d + 1) >> 1;
        if (offs[mid]! < high) c = mid;
        else d = mid - 1;
      }
      return start * RANGE_BASE + Math.max(start, c);
    },
    (current, previous) => {
      if (current < 0 || current === previous) return;
      scheduleOnRN(applyRange, Math.floor(current / RANGE_BASE), current % RANGE_BASE);
    },
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    onHeight(pageId, event.nativeEvent.layout.height);
    measureContainer();
    setTimeout(measureContainer, 150);
  };

  return (
    <View ref={containerRef as never} collapsable={false} onLayout={handleLayout} style={style}>
      {rows.map((row, index) => {
        const key = keyOf(row);
        const mounted = !scrollWindow || (index >= range.start && index <= range.end);
        return (
          <WindowedRow
            key={key}
            rowKey={key}
            mounted={mounted}
            height={heights[index]!}
            onMeasured={reportHeight}
          >
            {mounted ? renderRow(row) : null}
          </WindowedRow>
        );
      })}
      {footer}
    </View>
  );
}

type WindowedRowProps = {
  rowKey: string;
  mounted: boolean;
  height: number;
  onMeasured: (key: string, height: number) => void;
  children: ReactNode;
};

// Mounted rows size themselves (and report their height); unmounted ones keep the last known height.
const WindowedRow = memo(function WindowedRow({ rowKey, mounted, height, onMeasured, children }: WindowedRowProps) {
  return (
    <View
      style={mounted ? undefined : { height }}
      onLayout={mounted ? (event) => onMeasured(rowKey, event.nativeEvent.layout.height) : undefined}
    >
      {children}
    </View>
  );
});
