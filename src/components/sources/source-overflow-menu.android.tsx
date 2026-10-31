import * as WebBrowser from 'expo-web-browser';

import { AndroidPopupMenu, type AndroidPopupItem } from '@/components/ui/android-popup-menu';
import { t } from '@/constants/locales';

type SourceOverflowMenuProps = {
  onOpenSettings: () => void;
  websiteUrl?: string;
};

export function SourceOverflowMenu({ onOpenSettings, websiteUrl }: SourceOverflowMenuProps) {
  const items: AndroidPopupItem[] = [
    { key: 'settings', label: t('source_settings_title'), icon: 'settings-outline', onPress: onOpenSettings },
  ];
  if (websiteUrl) {
    items.push({
      key: 'website',
      label: t('source_website'),
      icon: 'globe-outline',
      onPress: () => void WebBrowser.openBrowserAsync(websiteUrl),
    });
  }
  return <AndroidPopupMenu items={items} accessibilityLabel={t('source_settings_title')} />;
}
