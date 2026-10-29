import { useHeaderHeight } from "@react-navigation/elements";
import { useCallback, useState, type ReactNode } from "react";
import { Spacing } from "@/constants/theme";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";

const TABS_CONTENT_GAP = Spacing.md;

export function usePinnedTabs(visible: boolean) {
  const headerHeight = useHeaderHeight();
  const [height, setHeight] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    setHeight((prev) => (prev === next ? prev : next));
  }, []);

  const renderOverlay = (tabs: ReactNode) =>
    visible && headerHeight > 0 ? (
      <View
        style={[styles.overlay, { top: headerHeight }]}
        onLayout={onLayout}
      >
        {tabs}
      </View>
    ) : null;

  return { spacerHeight: visible ? height + TABS_CONTENT_GAP : 0, renderOverlay };
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },
});
