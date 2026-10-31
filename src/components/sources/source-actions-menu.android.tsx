import {
  cloneElement,
  isValidElement,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import {
  triggerSourceMenuHaptic,
  type SourceContextMenuOptions,
} from "@/components/sources/source-context-menu";
import { SourceListItem } from "@/components/sources/source-list-item";
import { Card } from "@/components/ui/card";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useTheme } from "@/hooks/use-theme";

type SourceListItemProps = ComponentProps<typeof SourceListItem>;

type SourceInstalledActionsProps = SourceContextMenuOptions & {
  onPress: () => void;
  children: ReactElement<SourceListItemProps>;
};

type MenuItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

function updateLabelFor(options: SourceContextMenuOptions): string | null {
  return options.updateVersion != null && options.onUpdate
    ? t("source_update_to", { version: String(options.updateVersion) })
    : null;
}

function buildMenuItems(options: SourceContextMenuOptions): MenuItem[] {
  const updateLabel = updateLabelFor(options);
  const onUpdate = options.onUpdate;
  return [
    ...(updateLabel && onUpdate
      ? [
          {
            key: "update",
            label: updateLabel,
            icon: "arrow-down-circle-outline" as const,
            onPress: onUpdate,
          },
        ]
      : []),
    {
      key: "pin",
      label: options.isPinned ? t("sources_unpin") : t("sources_pin"),
      icon: options.isPinned ? "pin-outline" : "pin",
      onPress: options.isPinned ? options.onUnpin : options.onPin,
    },
    {
      key: "reorder",
      label: t("sources_reorder"),
      icon: "reorder-three-outline",
      onPress: options.onReorder,
    },
    {
      key: "delete",
      label: t("sources_uninstall_action"),
      icon: "trash-outline",
      destructive: true,
      onPress: options.onDelete,
    },
  ];
}

function SourceInlineMenu({
  items,
  onClose,
}: {
  items: MenuItem[];
  onClose: () => void;
}) {
  const { colors, radius } = useTheme();

  return (
    <Card style={[styles.inlineMenu, { borderRadius: radius.md }]}>
      {items.map((item, index) => (
        <Pressable
          key={item.key}
          style={({ pressed }) => [
            styles.inlineMenuRow,
            index > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.separator,
            },
            pressed && { backgroundColor: colors.quaternaryFill },
          ]}
          onPress={() => {
            item.onPress();
            onClose();
          }}
          accessibilityRole="button"
        >
          <Ionicons
            name={item.icon}
            size={18}
            color={item.destructive ? colors.destructive : colors.label}
          />
          <ThemedText
            variant="body"
            color={item.destructive ? "destructive" : "label"}
          >
            {item.label}
          </ThemedText>
        </Pressable>
      ))}
    </Card>
  );
}

function SourceInstalledActionsFallback({
  onPress,
  children,
  ...menuProps
}: SourceInstalledActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const items = buildMenuItems(menuProps);

  if (!isValidElement(children)) return children;

  const closeMenu = () => setMenuOpen(false);

  return (
    <View>
      {cloneElement(children, {
        onPress: () => {
          closeMenu();
          onPress();
        },
        onLongPress: () => {
          triggerSourceMenuHaptic();
          setMenuOpen((open) => !open);
        },
      })}
      {menuOpen ? <SourceInlineMenu items={items} onClose={closeMenu} /> : null}
    </View>
  );
}

export function SourceInstalledActions(props: SourceInstalledActionsProps) {
  return <SourceInstalledActionsFallback {...props} />;
}

const styles = StyleSheet.create({
  inlineMenu: {
    marginTop: Spacing.xs,
    marginHorizontal: Spacing.lg,
    overflow: "hidden",
  },
  inlineMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
