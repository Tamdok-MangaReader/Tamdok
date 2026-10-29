import type { ReactNode } from "react";
import { View } from "react-native";

export function MeasuredPage({
  pageId,
  onHeight,
  children,
}: {
  pageId: string;
  onHeight: (pageId: string, height: number) => void;
  children: ReactNode;
}) {
  return (
    <View
      collapsable={false}
      onLayout={(event) => onHeight(pageId, event.nativeEvent.layout.height)}
    >
      {children}
    </View>
  );
}
