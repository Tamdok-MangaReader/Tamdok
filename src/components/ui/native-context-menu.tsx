import { Button, ContextMenu, Host, RNHostView } from "@expo/ui/swift-ui";
import type { Ionicons } from "@expo/vector-icons";
import type { ReactElement } from "react";

import { useTheme } from "@/hooks/use-theme";

export type NativeContextMenuItem = {
  key: string;
  label: string;
  /** SF Symbol name (iOS). */
  systemImage: string;
  /** Ionicons fallback (Android). */
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

type NativeContextMenuProps = {
  children: ReactElement;
  items: NativeContextMenuItem[];
};

/** iOS: native SwiftUI context menu (long-press) wrapped around a row. */
export function NativeContextMenu({ children, items }: NativeContextMenuProps) {
  const { isDark } = useTheme();
  return (
    <Host matchContents={{ vertical: true }} colorScheme={isDark ? "dark" : "light"}>
      <ContextMenu>
        <ContextMenu.Trigger>
          <RNHostView matchContents={{ vertical: true }}>{children}</RNHostView>
        </ContextMenu.Trigger>
        <ContextMenu.Items>
          {items.map((item) => (
            <Button
              key={item.key}
              label={item.label}
              systemImage={item.systemImage as never}
              role={item.destructive ? "destructive" : undefined}
              onPress={item.onPress}
            />
          ))}
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}
