import * as Haptics from 'expo-haptics';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

import { t } from '@/constants/locales';
import type { InstalledSource } from '@/parsers/shared/types';

export type SourceContextMenuOptions = {
  source: InstalledSource;
  isPinned: boolean;
  onPin: () => void;
  onUnpin: () => void;
  onReorder: () => void;
  onDelete: () => void;
};

export function triggerSourceMenuHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function showSourceContextMenu(options: SourceContextMenuOptions): void {
  triggerSourceMenuHaptic();

  const pinLabel = options.isPinned ? t('sources_unpin') : t('sources_pin');

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: options.source.manifest.info.name,
        options: [pinLabel, t('sources_reorder'), t('sources_uninstall_action'), t('cancel')],
        cancelButtonIndex: 3,
        destructiveButtonIndex: 2,
      },
      (buttonIndex) => {
        if (buttonIndex === 0) {
          options.isPinned ? options.onUnpin() : options.onPin();
        } else if (buttonIndex === 1) {
          options.onReorder();
        } else if (buttonIndex === 2) {
          options.onDelete();
        }
      },
    );
    return;
  }

  Alert.alert(options.source.manifest.info.name, undefined, [
    { text: pinLabel, onPress: options.isPinned ? options.onUnpin : options.onPin },
    { text: t('sources_reorder'), onPress: options.onReorder },
    { text: t('sources_uninstall_action'), onPress: options.onDelete, style: 'destructive' },
    { text: t('cancel'), style: 'cancel' },
  ]);
}
