import { Button, Host, Menu, RNHostView } from '@expo/ui/swift-ui';
import { buttonStyle, menuIndicator, menuStyle } from '@expo/ui/swift-ui/modifiers';
import * as WebBrowser from 'expo-web-browser';
import { ActionSheetIOS, Alert, Platform, StyleSheet } from 'react-native';

import { HeaderIconButton } from '@/components/ui/header-icon-button';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';

type SourceOverflowMenuProps = {
  onOpenSettings: () => void;
  websiteUrl?: string;
};

export function SourceOverflowMenu({ onOpenSettings, websiteUrl }: SourceOverflowMenuProps) {
  const { colors, isDark } = useTheme();

  const openWebsite = () => {
    if (!websiteUrl) return;
    void WebBrowser.openBrowserAsync(websiteUrl);
  };

  const openFallbackMenu = () => {
    const options = [t('source_settings_title'), ...(websiteUrl ? [t('source_website')] : []), t('cancel')];
    const cancelIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex },
        (index) => {
          if (index === 0) onOpenSettings();
          if (websiteUrl && index === 1) openWebsite();
        },
      );
      return;
    }

    const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' }> = [
      { text: t('source_settings_title'), onPress: onOpenSettings },
    ];
    if (websiteUrl) buttons.push({ text: t('source_website'), onPress: openWebsite });
    buttons.push({ text: t('cancel'), style: 'cancel' });
    Alert.alert(t('sources'), undefined, buttons);
  };

  if (Platform.OS === 'ios') {
    return (
      <Host matchContents seedColor={colors.tint} colorScheme={isDark ? 'dark' : 'light'} style={styles.host}>
        <Menu
          label={
            <RNHostView matchContents>
              <HeaderIconButton icon='ellipsis-horizontal' accessibilityLabel={t('source_settings_title')} />
            </RNHostView>
          }
          modifiers={[menuStyle('button'), buttonStyle('plain'), menuIndicator('hidden')]}>
          <Button label={t('source_settings_title')} systemImage='gearshape' onPress={onOpenSettings} />
          {websiteUrl ? (
            <Button label={t('source_website')} systemImage='safari' onPress={openWebsite} />
          ) : null}
        </Menu>
      </Host>
    );
  }

  return (
    <HeaderIconButton
      icon='ellipsis-horizontal'
      onPress={openFallbackMenu}
      accessibilityLabel={t('source_settings_title')}
    />
  );
}

const styles = StyleSheet.create({
  host: {
    width: 28,
    height: 28,
  },
});
