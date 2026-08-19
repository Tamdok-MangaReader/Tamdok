import { Button, ContextMenu, Host, RNHostView } from '@expo/ui/swift-ui';
import { cloneElement, isValidElement, useState, type ComponentProps, type ReactElement } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  triggerSourceMenuHaptic,
  type SourceContextMenuOptions,
} from '@/components/sources/source-context-menu';
import { SourceListItem } from '@/components/sources/source-list-item';
import { Card } from '@/components/ui/card';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';

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

function buildMenuItems(options: SourceContextMenuOptions): MenuItem[] {
  return [
    {
      key: 'pin',
      label: options.isPinned ? t('sources_unpin') : t('sources_pin'),
      icon: options.isPinned ? 'pin-outline' : 'pin',
      onPress: options.isPinned ? options.onUnpin : options.onPin,
    },
    {
      key: 'reorder',
      label: t('sources_reorder'),
      icon: 'reorder-three-outline',
      onPress: options.onReorder,
    },
    {
      key: 'delete',
      label: t('sources_uninstall_action'),
      icon: 'trash-outline',
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
            index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
            pressed && { backgroundColor: colors.quaternaryFill },
          ]}
          onPress={() => {
            item.onPress();
            onClose();
          }}
          accessibilityRole='button'>
          <Ionicons
            name={item.icon}
            size={18}
            color={item.destructive ? colors.destructive : colors.label}
          />
          <ThemedText variant='body' color={item.destructive ? 'destructive' : 'label'}>
            {item.label}
          </ThemedText>
        </Pressable>
      ))}
    </Card>
  );
}

function SourceInstalledActionsNative({
  onPress,
  children,
  ...menuProps
}: SourceInstalledActionsProps) {
  const { isDark } = useTheme();
  const pinLabel = menuProps.isPinned ? t('sources_unpin') : t('sources_pin');

  if (!isValidElement(children)) return children;

  return (
    <Host matchContents colorScheme={isDark ? 'dark' : 'light'}>
      <ContextMenu>
        <ContextMenu.Trigger>
          <RNHostView matchContents>{cloneElement(children, { onPress })}</RNHostView>
        </ContextMenu.Trigger>
        <ContextMenu.Items>
          <Button
            label={pinLabel}
            systemImage={menuProps.isPinned ? 'pin.slash' : 'pin'}
            onPress={() => (menuProps.isPinned ? menuProps.onUnpin() : menuProps.onPin())}
          />
          <Button
            label={t('sources_reorder')}
            systemImage='line.3.horizontal'
            onPress={menuProps.onReorder}
          />
          <Button
            label={t('sources_uninstall_action')}
            systemImage='trash'
            role='destructive'
            onPress={menuProps.onDelete}
          />
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
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
  if (Platform.OS === 'ios') {
    return <SourceInstalledActionsNative {...props} />;
  }
  return <SourceInstalledActionsFallback {...props} />;
}

const styles = StyleSheet.create({
  inlineMenu: {
    marginTop: Spacing.xs,
    marginHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  inlineMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
