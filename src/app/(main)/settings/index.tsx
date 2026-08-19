import { Stack, useRouter, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as MailComposer from 'expo-mail-composer';
import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppIcon } from '@/components/branding/app-icon';
import { Card, CardSeparator } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { ScreenContent } from '@/components/ui/screen-content';
import { SectionLabel } from '@/components/ui/section-label';
import { SFSymbolIcon } from '@/components/ui/sf-symbol-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { getAppSettings, updateAppSettings } from '@/services/app-settings';
import { subscribeAppSettings } from '@/utils/app-settings-events';
import { useTheme } from '@/hooks/use-theme';

const GITHUB_URL = 'https://github.com/Tamdok-MangaReader';

const MENU_ITEMS_FIRST = [
  { icon: 'color-palette-outline' as const, labelKey: 'section_appearance', path: '/settings/appearance' },
  { icon: 'library-outline' as const, labelKey: 'library_settings_title', path: '/settings/library' },
  { icon: 'book-outline' as const, labelKey: 'reader_settings_title', path: '/settings/reader' },
  { icon: 'globe-outline' as const, labelKey: 'section_sources', path: '/settings/sources' },
];

const MENU_ITEMS_SECOND = [
  { icon: 'download-outline' as const, labelKey: 'downloads_settings_title', path: '/settings/downloads' },
  { icon: 'cloud-upload-outline' as const, labelKey: 'backups_settings_title', path: '/settings/backups' },
];

const MENU_ITEMS_THIRD = [
  { icon: 'notifications-outline' as const, labelKey: 'section_notifications', path: '/settings/notifications' },
  { icon: 'construct-outline' as const, labelKey: 'advanced_settings_title', path: '/settings/advanced' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const appVersion = Constants.expoConfig?.version ?? '—';
  const buildNumber =
    Constants.nativeBuildVersion ??
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode ??
    '—';
  const [incognitoMode, setIncognitoMode] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);

  const loadSettings = useCallback(async () => {
    const settings = await getAppSettings();
    setIncognitoMode(settings.incognitoMode);
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    void loadSettings();
    return subscribeAppSettings(() => {
      void loadSettings();
    });
  }, [loadSettings]);

  const openEmail = async () => {
    if (await MailComposer.isAvailableAsync()) {
      MailComposer.composeAsync({ recipients: ['me@sleaf.dev'], subject: 'Tamdok' });
    } else {
      Linking.openURL('mailto:me@sleaf.dev');
    }
  };

  const toggleIncognitoMode = (value: boolean) => {
    setIncognitoMode(value);
    void updateAppSettings({ incognitoMode: value });
  };

  return (
    <>
      <Stack.Title>{t('settings')}</Stack.Title>
      <ScreenContent>
        <SectionLabel isFirst>{t('app_info')}</SectionLabel>
        <Card style={styles.appCard}>
          <View style={styles.appRow}>
            <AppIcon />
            <View style={styles.appMeta}>
              <ThemedText variant='title3' style={styles.appName}>
                {t('app_name')}
              </ThemedText>
              <ThemedText variant='subheadline' color='secondaryLabel'>
                {t('app_version')} {appVersion}
              </ThemedText>
              <ThemedText variant='footnote' color='tertiaryLabel'>
                {t('app_build')} {buildNumber}
              </ThemedText>
            </View>
          </View>
        </Card>

        <SectionLabel>{t('settings_privacy_section')}</SectionLabel>
        <Card>
          <View style={styles.switchRow}>
            <View style={styles.switchMeta}>
              <ThemedText variant='body'>{t('incognito_mode')}</ThemedText>
              <ThemedText variant='caption1' color='secondaryLabel'>
                {t('incognito_mode_hint')}
              </ThemedText>
            </View>
            <Switch value={incognitoMode} disabled={!settingsReady} onValueChange={toggleIncognitoMode} />
          </View>
        </Card>

        <SectionLabel>{t('settings_sections')}</SectionLabel>
        <Card>
          {MENU_ITEMS_FIRST.map((item, index) => (
            <View key={item.path}>
              <ListRow
                icon={item.icon}
                label={t(item.labelKey)}
                onPress={() => router.push(item.path as Href)}
                isFirst={index === 0}
                isLast={index === MENU_ITEMS_FIRST.length - 1}
              />
              {index < MENU_ITEMS_FIRST.length - 1 && <CardSeparator />}
            </View>
          ))}
        </Card>

        <Card>
          {MENU_ITEMS_SECOND.map((item, index) => (
            <View key={item.path}>
              <ListRow
                icon={item.icon}
                label={t(item.labelKey)}
                onPress={() => router.push(item.path as Href)}
                isFirst={index === 0}
                isLast={index === MENU_ITEMS_SECOND.length - 1}
              />
              {index < MENU_ITEMS_SECOND.length - 1 && <CardSeparator />}
            </View>
          ))}
        </Card>

        <Card>
          {MENU_ITEMS_THIRD.map((item, index) => (
            <View key={item.path}>
              <ListRow
                icon={item.icon}
                label={t(item.labelKey)}
                onPress={() => router.push(item.path as Href)}
                isFirst={index === 0}
                isLast={index === MENU_ITEMS_THIRD.length - 1}
              />
              {index < MENU_ITEMS_THIRD.length - 1 && <CardSeparator />}
            </View>
          ))}
        </Card>

        <SectionLabel>{t('support')}</SectionLabel>
        <Card style={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={styles.supportRow}>
            <ThemedText variant='body'>{t('made_with_love_prefix')}</ThemedText>
            <SFSymbolIcon name='heart.fill' size={16} color='#FF3B30' fallback='heart' weight='semibold' />
            <ThemedText variant='body'>{t('made_with_love_suffix')}</ThemedText>
            <Image style={[styles.avatar, { borderRadius: radius.sm }]} source={require('@/assets/images/SolsticeLeaf.png')} />
          </View>
          <View style={styles.supportActions}>
            <Pressable
              style={({ pressed }) => [
                styles.emailButton,
                { backgroundColor: colors.tint, borderRadius: radius.md },
                pressed && styles.pressed,
              ]}
              onPress={openEmail}
              accessibilityRole='button'>
              <ThemedText variant='headline' color='onTint'>
                {t('contact_email')}
              </ThemedText>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.githubButton,
                { backgroundColor: colors.secondaryFill, borderRadius: radius.md },
                pressed && styles.pressed,
              ]}
              onPress={() => void Linking.openURL(GITHUB_URL)}
              accessibilityRole='button'
              accessibilityLabel='GitHub'>
              <Ionicons name='logo-github' size={24} color={colors.secondaryLabel} />
            </Pressable>
          </View>
        </Card>
      </ScreenContent>
    </>
  );
}

const styles = StyleSheet.create({
  appCard: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  appMeta: {
    flex: 1,
    gap: 2,
  },
  appName: {
    fontWeight: '700',
  },
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
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  avatar: {
    width: 20,
    height: 20,
  },
  supportActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emailButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  githubButton: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
