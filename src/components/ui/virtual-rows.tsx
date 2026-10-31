import { memo, type ComponentType, type ReactNode } from "react";
import {
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  createHiddenVirtualView,
  type VirtualViewProps,
} from "@/rn-private/components/virtualview/VirtualView";

// Rows are wrapped in React Native's private VirtualView so that rows far outside the viewport are
// unmounted natively but keep their height (a placeholder). One VirtualView component is created per
// rounded height and cached here, because the factory bakes the placeholder height into the component.
const hiddenViews = new Map<number, ComponentType<VirtualViewProps>>();

function hiddenViewFor(height: number): ComponentType<VirtualViewProps> {
  const key = Math.max(1, Math.round(height));
  let view = hiddenViews.get(key);
  if (!view) {
    view = createHiddenVirtualView({ height: key });
    hiddenViews.set(key, view);
  }
  return view;
}

// `height` is only an estimate used while a row is not rendered: it should be close to the real height,
// otherwise the scroll bar jumps when rows are mounted and measured.
export const VirtualRow = memo(function VirtualRow({
  height,
  children,
}: {
  height: number;
  children: ReactNode;
}) {
  const View_ = hiddenViewFor(height);
  return <View_>{children}</View_>;
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

// Renders a plain (non-scrolling) list of virtualised rows inside a parent ScrollView. The container's
// measured height is reported through `onHeight`, which lets pagers (see usePagerHeights) size their pages.
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
  const handleLayout = (event: LayoutChangeEvent) =>
    onHeight(pageId, event.nativeEvent.layout.height);

  return (
    <View collapsable={false} onLayout={handleLayout} style={style}>
      {rows.map((row) => (
        <VirtualRow
          key={keyOf(row)}
          height={typeof rowHeight === "number" ? rowHeight : rowHeight(row)}
        >
          {renderRow(row)}
        </VirtualRow>
      ))}
      {footer}
    </View>
  );
}
