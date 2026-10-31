import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState, type ReactElement } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { ThemedText } from "@/components/ui/themed-text";
import { useTheme } from "@/hooks/use-theme";
import type { NativeContextMenuItem } from "@/components/ui/native-context-menu";

export type { NativeContextMenuItem };

type NativeContextMenuProps = {
  children: ReactElement;
  items: NativeContextMenuItem[];
};

/**
 * Android: long-press opens a Material bottom sheet with the same actions.
 * A gesture-handler LongPress is used so it coexists with the row's own Pressable.
 */
export function NativeContextMenu({ children, items }: NativeContextMenuProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const longPress = Gesture.LongPress()
    .minDuration(380)
    .runOnJS(true)
    .onStart(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setOpen(true);
    });

  const close = () => setOpen(false);

  return (
    <>
      <GestureDetector gesture={longPress}>
        <View collapsable={false}>{children}</View>
      </GestureDetector>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={close}>
          <View style={[styles.sheet, { backgroundColor: colors.tertiarySystemBackground }]}>
            {items.map((item) => (
              <Pressable
                key={item.key}
                style={styles.row}
                android_ripple={{ color: colors.quaternaryFill }}
                onPress={() => {
                  close();
                  // Dismiss the modal first so alerts/sheets triggered by the action can present.
                  setTimeout(item.onPress, 0);
                }}
                accessibilityRole="button">
                <Ionicons name={item.icon} size={22} color={item.destructive ? colors.destructive : colors.label} />
                <ThemedText variant="body" color={item.destructive ? "destructive" : "label"}>
                  {item.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { paddingVertical: 12, paddingBottom: 24 },
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 24, paddingVertical: 16 },
});
