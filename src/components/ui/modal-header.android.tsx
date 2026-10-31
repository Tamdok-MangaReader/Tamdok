import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export const MODAL_HEADER_HEIGHT = 72;

type ModalHeaderProps = {
  title: string;
  closeLabel: string;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
  actionLoading?: boolean;
  actionDisabled?: boolean;
};

/** Material top app bar: opaque surface, close icon on the left, text action on the right. */
export function ModalHeader({
  title,
  closeLabel,
  onClose,
  actionLabel,
  onAction,
  actionLoading = false,
  actionDisabled = false,
}: ModalHeaderProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[styles.root, { backgroundColor: colors.secondarySystemBackground }]}
      pointerEvents="box-none"
    >
      <View style={styles.row}>
        <View style={styles.side}>
          <GlassIconButton
            icon="close"
            size={48}
            iconSize={24}
            tintColor="transparent"
            onPress={onClose}
            accessibilityLabel={closeLabel}
          />
        </View>
        <ThemedText variant="headline" style={styles.title} numberOfLines={1}>
          {title}
        </ThemedText>
        <View style={[styles.side, styles.sideEnd]}>
          {actionLabel && onAction ? (
            <Pressable
              style={styles.action}
              android_ripple={{ color: colors.quaternaryFill }}
              onPress={onAction}
              disabled={actionDisabled || actionLoading}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <ThemedText
                  variant="callout"
                  color={actionDisabled ? "tertiaryLabel" : "tint"}
                  style={styles.actionLabel}
                >
                  {actionLabel}
                </ThemedText>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: MODAL_HEADER_HEIGHT,
    zIndex: 10,
    elevation: 2,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
  },
  side: {
    minWidth: 88,
    alignItems: "flex-start",
  },
  sideEnd: {
    alignItems: "flex-end",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontWeight: "600",
  },
  action: {
    paddingHorizontal: Spacing.lg,
    minHeight: 40,
    justifyContent: "center",
    minWidth: 56,
    alignItems: "center",
    borderRadius: 20,
    overflow: "hidden",
  },
  actionLabel: { fontWeight: "600" },
});
