import * as Haptics from "expo-haptics";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { FullWindowOverlay } from "react-native-screens";

import { GlassSurface } from "@/components/ui/glass-surface";
import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

// Lightweight replacement for a native per-item context menu.
//
// A native ContextMenu host per cover was too heavy for big grids. This component renders ONE
// ordinary view per item and only creates the overlay after a long press:
//  1. long press -> measure the item in window coordinates (the "anchor");
//  2. a transparent Modal (inside a FullWindowOverlay so it covers the native tab bar) shows a dim
//     backdrop, a scaled-up clone of the item at the same position, and a glass card with the actions;
//  3. the clone is rendered by calling `renderContent` again with a no-op long-press handler.
type Anchor = { x: number; y: number; width: number; height: number };

// The react-native typings of this project do not expose measureInWindow on View refs, hence this minimal type.
type MeasurableView = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

export type LiftedMenuItem = {
  key: string;
  label: string;
  sfSymbol: string;
  fallback: ComponentProps<typeof SFSymbolIcon>["fallback"];
  destructive?: boolean;
  onPress: () => void;
};

type LiftedActionMenuProps = {
  items: LiftedMenuItem[];
  holdDelay?: number;
  liftScale?: number;
  renderContent: (onLongPress: () => void) => ReactElement;
};

// Layout constants: card width, minimum distance to the screen edges, and gap between item and card.
const MENU_WIDTH = 260;
const EDGE = 12;
const GAP = 10;
const NOOP = () => {};

export const LiftedActionMenu = memo(function LiftedActionMenu({
  items,
  liftScale = 1.03,
  renderContent,
}: LiftedActionMenuProps) {
  const ref = useRef<MeasurableView>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  // iOS only (the lifted menu relies on iOS overlay behaviour and haptics).
  const handleLongPress = useCallback(() => {
    if (Platform.OS !== "ios") return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ref.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  }, []);

  const handleClose = useCallback(() => setAnchor(null), []);

  return (
    <>
      // `collapsable={false}` keeps the wrapper in the native tree on Android so measureInWindow works.
      <View ref={ref as never} collapsable={false}>
        {renderContent(handleLongPress)}
      </View>
      {anchor ? (
        <LiftedOverlay
          anchor={anchor}
          items={items}
          liftScale={liftScale}
          renderContent={renderContent}
          onClose={handleClose}
        />
      ) : null}
    </>
  );
});

function LiftedOverlay({
  anchor,
  items,
  liftScale,
  renderContent,
  onClose,
}: {
  anchor: Anchor;
  items: LiftedMenuItem[];
  liftScale: number;
  renderContent: (onLongPress: () => void) => ReactElement;
  onClose: () => void;
}) {
  const { colors, radius } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [menuHeight, setMenuHeight] = useState(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(liftScale, { damping: 16, stiffness: 220 });
  }, [scale, liftScale]);

  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Horizontal: centre the card on the item, clamped to the screen.
  const menuLeft = Math.min(
    Math.max(anchor.x + anchor.width / 2 - MENU_WIDTH / 2, EDGE),
    windowWidth - EDGE - MENU_WIDTH,
  );
  // Vertical: show the card below the item if it fits, otherwise above. The first render has height 0,
  // so the card stays invisible (opacity 0) until onLayout reports its real height.
  const spaceBelow = windowHeight - (anchor.y + anchor.height) - GAP - EDGE;
  const placeBelow = menuHeight === 0 || menuHeight <= spaceBelow;
  const menuTop = placeBelow
    ? anchor.y + anchor.height + GAP
    : Math.max(EDGE, anchor.y - GAP - menuHeight);

  const onMenuLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    setMenuHeight((prev) => (prev === next ? prev : next));
  };

  const content = (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        // The clone is purely visual; touches go to the backdrop.
        pointerEvents="none"
        style={[
          styles.lifted,
          {
            left: anchor.x,
            top: anchor.y,
            width: anchor.width,
            height: anchor.height,
          },
          liftStyle,
        ]}
      >
        {renderContent(NOOP)}
      </Animated.View>
      <View
        onLayout={onMenuLayout}
        style={[
          styles.menuWrap,
          {
            left: menuLeft,
            top: menuTop,
            width: MENU_WIDTH,
            opacity: menuHeight === 0 ? 0 : 1,
          },
        ]}
      >
        <GlassSurface
          borderRadius={radius.md}
          style={styles.card}
          glassStyle="regular"
        >
          {items.map((item, index) => {
            const color = item.destructive ? colors.destructive : colors.label;
            return (
              <Pressable
                key={item.key}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.separator,
                  },
                  pressed && { backgroundColor: colors.quaternaryFill },
                ]}
                onPress={() => {
                  // Close first, then run the action, so actions that navigate or open sheets are not blocked by the Modal.
                  void Haptics.selectionAsync();
                  onClose();
                  item.onPress();
                }}
                accessibilityRole="button"
              >
                <SFSymbolIcon
                  name={item.sfSymbol}
                  fallback={item.fallback}
                  size={18}
                  color={color}
                />
                <ThemedText
                  variant="body"
                  color={item.destructive ? "destructive" : "label"}
                  style={styles.label}
                  numberOfLines={1}
                >
                  {item.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </GlassSurface>
      </View>
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <FullWindowOverlay>{content}</FullWindowOverlay>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  lifted: {
    position: "absolute",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  menuWrap: {
    position: "absolute",
  },
  card: {
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  label: {
    flex: 1,
  },
});
