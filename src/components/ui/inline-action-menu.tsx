import * as Haptics from 'expo-haptics';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { SFSymbolIcon } from '@/components/ui/sf-symbol-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type InlineActionMenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type InlineActionMenuItem = {
  key: string;
  label: string;
  sfSymbol: string;
  fallbackIcon:
    | 'share-outline'
    | 'refresh-outline'
    | 'trash-outline'
    | 'folder-outline'
    | 'download-outline'
    | 'checkmark-circle-outline'
    | 'create-outline'
    | 'star-outline';
  destructive?: boolean;
  onPress: () => void;
};

type InlineActionMenuProps = {
  visible: boolean;
  anchor: InlineActionMenuAnchor | null;
  title?: string;
  items: InlineActionMenuItem[];
  onClose: () => void;
};

export function InlineActionMenu({ visible, anchor, title, items, onClose }: InlineActionMenuProps) {
  const { colors, radius } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  if (!visible || !anchor) return null;

  const panelWidth = Math.min(windowWidth - Spacing.lg * 2, 280);
  const panelLeft = Math.min(Math.max(Spacing.lg, anchor.x + anchor.width - panelWidth), windowWidth - panelWidth - Spacing.lg);
  const preferredTop = anchor.y + anchor.height + Spacing.sm;
  const panelTop = Math.min(preferredTop, windowHeight - items.length * 52 - 80);

  const run = (item: InlineActionMenuItem) => {
    void Haptics.selectionAsync();
    onClose();
    item.onPress();
  };

  return (
    <Modal visible transparent animationType='fade' onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.panelWrap, { top: panelTop, left: panelLeft, width: panelWidth }]}
          onPress={(event) => event.stopPropagation()}>
          <GlassSurface borderRadius={radius.md} style={styles.panel}>
            {title ? (
              <ThemedText variant='footnote' color='secondaryLabel' style={styles.title}>
                {title}
              </ThemedText>
            ) : null}
            <View style={styles.list}>
              {items.map((item, index) => (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [
                    styles.row,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                    pressed && { backgroundColor: colors.quaternaryFill },
                  ]}
                  onPress={() => run(item)}
                  accessibilityRole='button'>
                  <SFSymbolIcon
                    name={item.sfSymbol}
                    fallback={item.fallbackIcon}
                    size={18}
                    color={item.destructive ? colors.destructive : colors.label}
                  />
                  <ThemedText variant='body' color={item.destructive ? 'destructive' : 'label'} style={styles.label}>
                    {item.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </GlassSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  panelWrap: {
    position: 'absolute',
    zIndex: 10,
  },
  panel: {
    overflow: 'hidden',
  },
  title: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  list: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  label: {
    flex: 1,
  },
});
