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

// The override also switches native chrome (alerts, keyboards, status bar, system dialogs);
// 'unspecified' hands control back to the system on both platforms.
function applyNativeScheme(mode: AppThemeMode): void {
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
}

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  // Follows the system scheme and, once an override is applied, the overridden one.
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<AppThemeMode>('system');

  useEffect(() => {
    const load = () =>
      getValue<AppThemeMode>(storageKeys.THEME_MODE, 'system').then((stored) => {
        applyNativeScheme(stored);
        setThemeModeState(stored);
      });
    void load();
    // Restoring a backup or resetting settings rewrites the stored mode.
    return subscribeAppSettings(() => void load());
  }, []);

  const resolvedColorScheme: 'light' | 'dark' =
    themeMode === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : themeMode;

  const value = useMemo<ThemePreferenceContextValue>(
    () => ({
      themeMode,
      resolvedColorScheme,
      setThemeMode: async (mode) => {
        applyNativeScheme(mode);
        setThemeModeState(mode);
        await setValue(storageKeys.THEME_MODE, mode);
      },
    }),
    [themeMode, resolvedColorScheme],
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    throw new Error('useThemePreference must be used within ThemePreferenceProvider');
  }
  return context;
}
