import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderIconButton } from '@/components/ui/header-icon-button';
import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

export type AndroidPopupItem = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  /** Nested actions: tapping the row opens them in place of the current list. */
  children?: AndroidPopupItem[];
  onPress?: () => void;
};

type AndroidPopupMenuProps = {
  items: AndroidPopupItem[];
  triggerIcon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
};

/**
 * Material-style dropdown menu anchored to the top-right corner (where header
 * action buttons live). Replaces SwiftUI Menu / ActionSheetIOS on Android.
 */
export function AndroidPopupMenu({ items, triggerIcon = 'ellipsis-vertical', accessibilityLabel }: AndroidPopupMenuProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<AndroidPopupItem | null>(null);
  const close = () => {
    setOpen(false);
    setSubmenu(null);
  };
  const visibleItems = submenu?.children ?? items;

  return (
    <>
      <HeaderIconButton icon={triggerIcon} onPress={() => setOpen(true)} accessibilityLabel={accessibilityLabel} />
      <Modal visible={open} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={close}>
          <View
            style={[
              styles.card,
              { top: insets.top + 8, backgroundColor: colors.tertiarySystemBackground, borderColor: colors.separator },
            ]}>
            {submenu ? (
              <Pressable
                style={styles.row}
                android_ripple={{ color: colors.quaternaryFill }}
                onPress={() => setSubmenu(null)}
                accessibilityRole="menuitem"
              >
                <Ionicons name="chevron-back" size={20} color={colors.label} />
                <ThemedText variant="body" style={styles.label}>
                  {submenu.label}
                </ThemedText>
              </Pressable>
            ) : null}
            {visibleItems.map((item) => (
              <Pressable
                key={item.key}
                style={styles.row}
                android_ripple={{ color: colors.quaternaryFill }}
                onPress={() => {
                  if (item.children?.length) {
                    setSubmenu(item);
                    return;
                  }
                  close();
                  // Let the modal dismiss first so follow-up alerts/sheets can present.
                  if (item.onPress) setTimeout(item.onPress, 0);
                }}
                accessibilityRole="menuitem">
                {item.icon ? (
                  <Ionicons name={item.icon} size={20} color={item.destructive ? colors.destructive : colors.label} />
                ) : null}
                <ThemedText variant="body" color={item.destructive ? 'destructive' : 'label'} style={styles.label}>
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
  backdrop: { flex: 1 },
  card: {
    position: 'absolute',
    right: 12,
    minWidth: 200,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  label: { flexShrink: 1 },
});
