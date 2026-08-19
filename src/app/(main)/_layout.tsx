import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useMemo } from 'react';

import { t } from '@/constants/locales';
import { useNavigationTheme } from '@/hooks/use-navigation-theme';

export default function MainTabLayout() {
  const { tabTintColor, tabIconColor } = useNavigationTheme();

  const tabIconColors = useMemo(
    () => ({ default: tabIconColor, selected: tabTintColor }),
    [tabIconColor, tabTintColor],
  );

  return (
    <NativeTabs tintColor={tabTintColor} iconColor={tabIconColors}>
      <NativeTabs.Trigger name='index'>
        <NativeTabs.Trigger.Label>{t('library')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf='books.vertical.fill' />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name='sources' role='contacts'>
        <NativeTabs.Trigger.Label>{t('sources')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf='globe.fill' />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name='history' role='history'>
        <NativeTabs.Trigger.Label>{t('history')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf='clock.arrow.trianglehead.counterclockwise.rotate.90' />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name='settings'>
        <NativeTabs.Trigger.Label>{t('settings')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf='gearshape.fill' />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name='search' role='search'>
        <NativeTabs.Trigger.Label>{t('search')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name='[...unmatched]' hidden />
    </NativeTabs>
  );
}
