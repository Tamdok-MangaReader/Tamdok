import { BlurView } from "expo-blur";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { GlassSurface } from "@/components/ui/glass-surface";
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

export function ModalHeader({
  title,
  closeLabel,
  onClose,
  actionLabel,
  onAction,
  actionLoading = false,
  actionDisabled = false,
}: ModalHeaderProps) {
  const { colors, radius, isDark } = useTheme();

  return (
    <View style={styles.root} pointerEvents="box-none">
      <BlurView
        style={StyleSheet.absoluteFill}
        intensity={70}
        tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
      />
      <View
        style={[styles.separator, { backgroundColor: colors.separator }]}
        pointerEvents="none"
      />
      <View style={styles.row}>
        <View style={styles.side}>
          <GlassIconButton
            icon="close"
            size={48}
            iconSize={24}
            onPress={onClose}
            accessibilityLabel={closeLabel}
          />
        </View>
        <ThemedText variant="headline" style={styles.title} numberOfLines={1}>
          {title}
        </ThemedText>
        <View style={[styles.side, styles.sideEnd]}>
          {actionLabel && onAction ? (
            <GlassSurface borderRadius={radius.pill} interactive>
              <Pressable
                style={styles.action}
                onPress={onAction}
                disabled={actionDisabled || actionLoading}
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <ThemedText
                    variant="title3"
                    color={actionDisabled ? "tertiaryLabel" : "tint"}
                  >
                    {actionLabel}
                  </ThemedText>
                )}
              </Pressable>
            </GlassSurface>
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
  },
  separator: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
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
    fontWeight: "700",
  },
  action: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 48,
    justifyContent: "center",
    minWidth: 56,
    alignItems: "center",
  },
});
