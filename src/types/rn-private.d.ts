declare module "@/rn-private/components/virtualview/VirtualView" {
  import type { ComponentType, ReactNode } from "react";
  import type { StyleProp, ViewStyle } from "react-native";

  export type VirtualViewProps = {
    children?: ReactNode;
    style?: StyleProp<ViewStyle>;
    nativeID?: string;
  };

  export function createHiddenVirtualView(
    style: StyleProp<ViewStyle>,
  ): ComponentType<VirtualViewProps>;
}
