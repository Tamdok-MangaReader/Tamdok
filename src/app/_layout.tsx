import {
  Stack,
  ThemeProvider,
  usePathname,
  useRouter,
  type Href,
} from "expo-router";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { AppState, Platform } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppSplash } from "@/components/ui/app-splash";
import { AppLockGate } from "@/components/privacy/app-lock-gate";
import { LibraryRefreshIsland } from "@/components/library/library-refresh-island";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { AidokuWasmHost } from "@/components/sources/aidoku-wasm-host";
import { AppearanceProvider } from "@/context/appearance-context";
import { SourcesProvider } from "@/context/sources-context";
import { ThemePreferenceProvider } from "@/context/theme-preference-context";
import { duoScreenLayout } from "@/hooks/use-duo-layout";
import { useExpoRouterTheme } from "@/hooks/use-navigation-theme";
import {
  buildRegistrySettingsHref,
  parseRegistryDeepLink,
  peekPendingRegistryDeepLink,
  renotifyPendingRegistryDeepLink,
  setPendingRegistryDeepLink,
} from "@/utils/registry-deep-link";
import {
  shouldShowWelcome,
  markWelcomeCompleted,
  subscribeWelcomeReplay,
} from "@/utils/welcome-data-loader";
import { installImageMemoryReclaimer } from "@/utils/image-memory";
import { syncBackgroundLibraryUpdates } from "@/services/background-library-update";
import { runAutoBackupIfNeeded, syncAutoBackupTask } from "@/services/auto-backup";
import { parseNewChapterResponse } from "@/services/notifications";
import { mangaHref } from "@/utils/manga-route";

export const unstable_settings = {
  anchor: "(main)",
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

function navigateToRegistrySettings(
  router: ReturnType<typeof useRouter>,
  registryUrl: string,
) {
  const href = buildRegistrySettingsHref(registryUrl) as Href;
  setTimeout(() => {
    router.replace(href);
    renotifyPendingRegistryDeepLink();
  }, 0);
}

const SOURCE_HOME_PATH = /^\/sources\/[^/]+$/;

function isOverlayPath(pathname: string): boolean {
  return pathname.startsWith("/manga") || pathname.startsWith("/reader");
}

function useRestoreSourceStack() {
  const pathname = usePathname();
  const router = useRouter();
  const lastTabPath = useRef<string | null>(null);
  const returnPath = useRef<string | null>(null);

  useEffect(() => {
    if (isOverlayPath(pathname)) {
      if (returnPath.current == null) returnPath.current = lastTabPath.current;
      return;
    }
    const target = returnPath.current;
    returnPath.current = null;
    lastTabPath.current = pathname;
    if (target && SOURCE_HOME_PATH.test(target) && pathname === "/sources") {
      router.navigate(target as Href);
    }
  }, [pathname, router]);
}

// (main) and manga host their own nested stacks that apply the Duo rail padding.
const rootScreenLayout: ComponentProps<typeof Stack>["screenLayout"] = (
  props,
) =>
  props.route.name === "[...unmatched]"
    ? duoScreenLayout(props)
    : props.children;

function RootLayoutContent() {
  const navigationTheme = useExpoRouterTheme();
  const [showWelcome, setShowWelcome] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const handledNotificationRef = useRef<string | null>(null);

  useRestoreSourceStack();

  const rootStackOptions = useMemo(
    () => ({ headerShown: false as const, freezeOnBlur: true as const }),
    [],
  );

  useEffect(() => {
    shouldShowWelcome()
      .then(setShowWelcome)
      .catch(() => setShowWelcome(false))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => subscribeWelcomeReplay(() => setShowWelcome(true)), []);
  useEffect(() => installImageMemoryReclaimer(), []);

  useEffect(() => {
    if (isLoading || showWelcome) return;
    void syncBackgroundLibraryUpdates();
    void syncAutoBackupTask();
    void runAutoBackupIfNeeded();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void runAutoBackupIfNeeded();
    });
    const timer = setInterval(
      () => void runAutoBackupIfNeeded(),
      15 * 60 * 1000,
    );
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [isLoading, showWelcome]);

  useEffect(() => {
    if (isLoading || showWelcome || !lastNotificationResponse) return;
    const handledId = `${lastNotificationResponse.notification.request.identifier}:${lastNotificationResponse.notification.date}`;
    if (handledNotificationRef.current === handledId) return;
    const target = parseNewChapterResponse(lastNotificationResponse);
    if (!target) return;
    handledNotificationRef.current = handledId;
    router.navigate(
      mangaHref(target.routeId, {
        key: target.mangaKey,
        title: target.title,
        cover: target.cover,
      }),
    );
  }, [isLoading, lastNotificationResponse, router, showWelcome]);

  useEffect(() => {
    if (isLoading || showWelcome) return;

    const handleDeepLink = (url: string) => {
      const registryUrl = parseRegistryDeepLink(url);
      if (!registryUrl) return;
      if (!setPendingRegistryDeepLink(registryUrl)) return;

      navigateToRegistrySettings(router, registryUrl);
    };

    void Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
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
    return <AppSplash />;
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <AidokuWasmHost />
      {showWelcome && <WelcomeScreen onComplete={handleWelcomeComplete} />}
      <Stack screenOptions={rootStackOptions} screenLayout={rootScreenLayout}>
        <Stack.Screen name="(main)" />
        <Stack.Screen name="manga" />
        <Stack.Screen
          name="reader"
          options={{
            headerShown: false,
            animation: "slide_from_right",
            gestureDirection: "horizontal",
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
            statusBarStyle: "light",
            statusBarAnimation: "fade",
            contentStyle: { backgroundColor: "#000" },
          }}
        />
        <Stack.Screen name="[...unmatched]" />
      </Stack>
      {Platform.OS === "ios" ? null : <LibraryRefreshIsland />}
      <AppLockGate />
    </ThemeProvider>
  );
}
