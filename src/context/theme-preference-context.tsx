import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { getValue, setValue, storageKeys } from '@/constants/storage';
import { subscribeAppSettings } from '@/utils/app-settings-events';

export type AppThemeMode = 'system' | 'light' | 'dark';

type ThemePreferenceContextValue = {
  themeMode: AppThemeMode;
  resolvedColorScheme: 'light' | 'dark';
  setThemeMode: (mode: AppThemeMode) => Promise<void>;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<AppThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);
  const [appearanceTick, setAppearanceTick] = useState(0);

  useEffect(() => {
    getValue<AppThemeMode>(storageKeys.THEME_MODE, 'system').then((storedMode) => {
      setThemeModeState(storedMode);
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    return subscribeAppSettings(() => {
      void getValue<AppThemeMode>(storageKeys.THEME_MODE, 'system').then(setThemeModeState);
    });
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(() => {
      setAppearanceTick((tick) => tick + 1);
    });
    return () => subscription.remove();
  }, []);

  const resolvedColorScheme = useMemo<'light' | 'dark'>(() => {
    if (themeMode === 'light') return 'light';
    if (themeMode === 'dark') return 'dark';
    const scheme = Appearance.getColorScheme() ?? systemColorScheme;
    return scheme === 'dark' ? 'dark' : 'light';
  }, [themeMode, systemColorScheme, appearanceTick]);

  useEffect(() => {
    if (!isLoaded) return;
    const setColorScheme = (Appearance as unknown as { setColorScheme?: (scheme: 'light' | 'dark' | null) => void })
      .setColorScheme;
    if (!setColorScheme) return;
    if (themeMode === 'system') {
      setColorScheme(null);
    } else {
      setColorScheme(themeMode);
    }
  }, [themeMode, isLoaded]);

  const setThemeMode = async (mode: AppThemeMode) => {
    setThemeModeState(mode);
    await setValue(storageKeys.THEME_MODE, mode);
  };

  return (
    <ThemePreferenceContext.Provider
      value={{
        themeMode,
        resolvedColorScheme,
        setThemeMode,
      }}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    throw new Error('useThemePreference must be used within ThemePreferenceProvider');
  }
  return context;
}
