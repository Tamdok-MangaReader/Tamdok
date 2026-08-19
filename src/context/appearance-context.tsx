import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  getAppIconName,
  resetAppIcon,
  setAlternateAppIcon,
  supportsAlternateIcons,
} from 'expo-alternate-app-icons';

import { DEFAULT_ACCENT_ID, getAccentPreset, normalizeAccentId, type AccentColorId } from '@/constants/accent-colors';
import { DEFAULT_APP_ICON_ID, getAppIconOption, normalizeAppIconId, type AppIconId } from '@/constants/app-icons';
import { getValue, setValue, storageKeys } from '@/constants/storage';
import { notifyAppearanceChanged, subscribeAppearance } from '@/utils/appearance-events';

type AppearanceContextValue = {
  accentColorId: AccentColorId;
  appIconId: AppIconId;
  setAccentColorId: (id: AccentColorId) => Promise<void>;
  setAppIconId: (id: AppIconId) => Promise<void>;
  appIconSupported: boolean;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [accentColorId, setAccentColorIdState] = useState<AccentColorId>(DEFAULT_ACCENT_ID);
  const [appIconId, setAppIconIdState] = useState<AppIconId>(DEFAULT_APP_ICON_ID);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      getValue<string>(storageKeys.ACCENT_COLOR, DEFAULT_ACCENT_ID),
      getValue<string>(storageKeys.APP_ICON, DEFAULT_APP_ICON_ID),
    ]).then(([accent, icon]) => {
      const normalizedAccent = normalizeAccentId(accent);
      setAccentColorIdState(normalizedAccent);
      if (normalizedAccent !== accent) {
        void setValue(storageKeys.ACCENT_COLOR, normalizedAccent);
      }
      const normalizedIcon = normalizeAppIconId(icon);
      setAppIconIdState(normalizedIcon);
      if (normalizedIcon !== icon) {
        void setValue(storageKeys.APP_ICON, normalizedIcon);
      }
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    return subscribeAppearance(() => {
      void Promise.all([
        getValue<string>(storageKeys.ACCENT_COLOR, DEFAULT_ACCENT_ID),
        getValue<string>(storageKeys.APP_ICON, DEFAULT_APP_ICON_ID),
      ]).then(([accent, icon]) => {
        setAccentColorIdState(normalizeAccentId(accent));
        setAppIconIdState(normalizeAppIconId(icon));
      });
    });
  }, []);

  const setAccentColorId = useCallback(async (id: AccentColorId) => {
    setAccentColorIdState(id);
    await setValue(storageKeys.ACCENT_COLOR, id);
    notifyAppearanceChanged();
  }, []);

  const setAppIconId = useCallback(async (id: AppIconId) => {
    setAppIconIdState(id);
    await setValue(storageKeys.APP_ICON, id);

    if (Platform.OS === 'ios' && supportsAlternateIcons) {
      const option = getAppIconOption(id);
      if (option.nativeName) {
        await setAlternateAppIcon(option.nativeName);
      } else {
        await resetAppIcon();
      }
    }

    notifyAppearanceChanged();
  }, []);

  useEffect(() => {
    if (!isLoaded || Platform.OS !== 'ios' || !supportsAlternateIcons) return;

    const currentNative = getAppIconName();
    const matched = getAppIconOption(appIconId);
    if (matched.nativeName === currentNative) return;
    if (matched.nativeName) {
      void setAlternateAppIcon(matched.nativeName);
    } else {
      void resetAppIcon();
    }
  }, [appIconId, isLoaded]);

  const value = useMemo(
    () => ({
      accentColorId,
      appIconId,
      setAccentColorId,
      setAppIconId,
      appIconSupported: Platform.OS === 'ios' && supportsAlternateIcons,
    }),
    [accentColorId, appIconId, setAccentColorId, setAppIconId],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error('useAppearance must be used within AppearanceProvider');
  }
  return context;
}

export function useAccentColors() {
  const { accentColorId } = useAppearance();
  const preset = getAccentPreset(accentColorId);
  return { preset, accentColorId };
}
