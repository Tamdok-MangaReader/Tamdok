import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ScreenContent } from '@/components/ui/screen-content';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import {
  getNotifyNewChapters,
  getNotifySourceUpdates,
  requestNotificationPermissions,
  setNotifyNewChapters,
  setNotifySourceUpdates,
} from '@/services/notifications';

export default function NotificationsSettingsScreen() {
  const [sourceUpdates, setSourceUpdates] = useState(true);
  const [newChapters, setNewChapters] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [updates, chapters] = await Promise.all([getNotifySourceUpdates(), getNotifyNewChapters()]);
      setSourceUpdates(updates);
      setNewChapters(chapters);
      setIsLoading(false);
    })();
  }, []);

  const showPermissionAlert = useCallback(() => {
    Alert.alert(t('settings_notifications_permission_title'), t('settings_notifications_permission_desc'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('settings_notifications_open_settings'),
        onPress: () => void Linking.openSettings(),
      },
    ]);
  }, []);

  const toggleSourceUpdates = async (value: boolean) => {
    if (value && !(await requestNotificationPermissions())) {
      showPermissionAlert();
      return;
    }
    const saved = await setNotifySourceUpdates(value);
    setSourceUpdates(saved);
  };

  const toggleNewChapters = async (value: boolean) => {
    if (value && !(await requestNotificationPermissions())) {
      showPermissionAlert();
      return;
    }
    const saved = await setNotifyNewChapters(value);
    setNewChapters(saved);
  };

  return (
    <>
      <Stack.Screen options={{ title: t('section_notifications') }} />
      <ScreenContent>
        <SectionLabel isFirst>{t('settings_notifications_section')}</SectionLabel>
        <Card>
          <View style={styles.switchRow}>
            <View style={styles.switchMeta}>
              <ThemedText variant='body'>{t('settings_notifications_source_updates')}</ThemedText>
              <ThemedText variant='caption1' color='secondaryLabel'>
                {t('settings_notifications_source_updates_hint')}
              </ThemedText>
            </View>
            <Switch value={sourceUpdates} disabled={isLoading} onValueChange={(value) => void toggleSourceUpdates(value)} />
          </View>
        </Card>

        <Card>
          <View style={styles.switchRow}>
            <View style={styles.switchMeta}>
              <ThemedText variant='body'>{t('settings_notifications_new_chapters')}</ThemedText>
              <ThemedText variant='caption1' color='secondaryLabel'>
                {t('settings_notifications_new_chapters_hint')}
              </ThemedText>
            </View>
            <Switch value={newChapters} disabled={isLoading} onValueChange={(value) => void toggleNewChapters(value)} />
          </View>
        </Card>

        {Platform.OS === 'ios' && (
          <ThemedText variant='caption1' color='tertiaryLabel' style={styles.footer}>
            {t('settings_notifications_ios_footer')}
          </ThemedText>
        )}
      </ScreenContent>
    </>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  switchMeta: {
    flex: 1,
    gap: Spacing.xs,
  },
  footer: {
    paddingHorizontal: Spacing.sm,
  },
});
