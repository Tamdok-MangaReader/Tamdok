import { Button, Host, Menu, RNHostView } from '@expo/ui/swift-ui';
import { buttonStyle, menuIndicator, menuStyle } from '@expo/ui/swift-ui/modifiers';
import { ActionSheetIOS, Alert, Platform, StyleSheet } from 'react-native';

import { HeaderIconButton } from '@/components/ui/header-icon-button';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';

type HistoryOverflowMenuProps = {
  onClearToday: () => void;
  onClearWeek: () => void;
  onClearAll: () => void;
};

export function HistoryOverflowMenu({ onClearToday, onClearWeek, onClearAll }: HistoryOverflowMenuProps) {
  const { colors, isDark } = useTheme();

  const openFallbackMenu = () => {
    const options = [t('history_clear_today'), t('history_clear_week'), t('history_clear_all'), t('cancel')];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3, destructiveButtonIndex: 2 },
        (index) => {
          if (index === 0) onClearToday();
          if (index === 1) onClearWeek();
          if (index === 2) onClearAll();
        },
      );
      return;
    }

    Alert.alert(t('history'), undefined, [
      { text: t('history_clear_today'), onPress: onClearToday, style: 'destructive' },
      { text: t('history_clear_week'), onPress: onClearWeek, style: 'destructive' },
      { text: t('history_clear_all'), onPress: onClearAll, style: 'destructive' },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  if (Platform.OS === 'ios') {
    return (
      <Host matchContents seedColor={colors.tint} colorScheme={isDark ? 'dark' : 'light'} style={styles.host}>
        <Menu
          label={
            <RNHostView matchContents>
              <HeaderIconButton icon='ellipsis-horizontal' accessibilityLabel={t('history_menu')} />
            </RNHostView>
          }
          modifiers={[menuStyle('button'), buttonStyle('plain'), menuIndicator('hidden')]}>
          <Button label={t('history_clear_today')} systemImage='calendar' role='destructive' onPress={onClearToday} />
          <Button label={t('history_clear_week')} systemImage='calendar.badge.clock' role='destructive' onPress={onClearWeek} />
          <Button label={t('history_clear_all')} systemImage='trash' role='destructive' onPress={onClearAll} />
        </Menu>
      </Host>
    );
  }

  return (
    <HeaderIconButton icon='ellipsis-horizontal' onPress={openFallbackMenu} accessibilityLabel={t('history_menu')} />
  );
}

const styles = StyleSheet.create({
  host: {
    width: 28,
    height: 28,
  },
});
