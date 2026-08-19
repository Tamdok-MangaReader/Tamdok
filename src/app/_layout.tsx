import { Stack, ThemeProvider, useRouter, type Href } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AidokuWasmHost } from '@/components/sources/aidoku-wasm-host';
import { WelcomeScreen } from '@/components/onboarding/WelcomeScreen';
import { AppearanceProvider } from '@/context/appearance-context';
import { SourcesProvider } from '@/context/sources-context';
import { ThemePreferenceProvider } from '@/context/theme-preference-context';
import { useExpoRouterTheme } from '@/hooks/use-navigation-theme';
import { useThemeColor } from '@/hooks/use-theme';
import {
  buildRegistrySettingsHref,
  parseRegistryDeepLink,
  peekPendingRegistryDeepLink,
  renotifyPendingRegistryDeepLink,
  setPendingRegistryDeepLink,
} from '@/utils/registry-deep-link';
import { shouldShowWelcome, markWelcomeCompleted, subscribeWelcomeReplay } from '@/utils/welcome-data-loader';

export const unstable_settings = {
  initialRouteName: '(main)',
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemePreferenceProvider>
        <AppearanceProvider>
          <SourcesProvider>
            <KeyboardProvider>
              <RootLayoutContent />
            </KeyboardProvider>
          </SourcesProvider>
        </AppearanceProvider>
      </ThemePreferenceProvider>
    </GestureHandlerRootView>
  );
}

function navigateToRegistrySettings(router: ReturnType<typeof useRouter>, registryUrl: string) {
  const href = buildRegistrySettingsHref(registryUrl) as Href;
  setTimeout(() => {
    router.replace(href);
    renotifyPendingRegistryDeepLink();
  }, 0);
}

function RootLayoutContent() {
  const backgroundColor = useThemeColor('systemBackground');
  const navigationTheme = useExpoRouterTheme();
  const [showWelcome, setShowWelcome] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const rootStackOptions = useMemo(() => ({ headerShown: false as const }), []);

  useEffect(() => {
    shouldShowWelcome()
      .then(setShowWelcome)
      .catch(() => setShowWelcome(false))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => subscribeWelcomeReplay(() => setShowWelcome(true)), []);

  useEffect(() => {
    if (isLoading || showWelcome) return;

    const handleDeepLink = (url: string) => {
      const registryUrl = parseRegistryDeepLink(url);
      if (!registryUrl) return;

      setPendingRegistryDeepLink(registryUrl);
      navigateToRegistrySettings(router, registryUrl);
    };

    void Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => subscription.remove();
  }, [isLoading, router, showWelcome]);

  const handleWelcomeComplete = async () => {
    try {
      await markWelcomeCompleted();
    } finally {
      setShowWelcome(false);
      const pendingRegistry = peekPendingRegistryDeepLink();
      if (pendingRegistry) {
        navigateToRegistrySettings(router, pendingRegistry);
      } else {
        router.setParams({ reselectNonce: Date.now().toString() });
      }
    }
  };

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor }} />;
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <AidokuWasmHost />
      {showWelcome && <WelcomeScreen onComplete={handleWelcomeComplete} />}
      <Stack screenOptions={rootStackOptions}>
        <Stack.Screen name='(main)' />
        <Stack.Screen name='manga' />
        <Stack.Screen
          name='reader'
          options={{
            headerShown: false,
            animation: 'slide_from_right',
            gestureDirection: 'horizontal',
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
            statusBarStyle: 'light',
            statusBarAnimation: 'fade',
            contentStyle: { backgroundColor: '#000' },
          }}
        />
        <Stack.Screen name='[...unmatched]' />
      </Stack>
    </ThemeProvider>
  );
}
