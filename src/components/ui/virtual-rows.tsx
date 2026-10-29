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
