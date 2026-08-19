import { Stack } from 'expo-router';

import { useNavigationTheme } from '@/hooks/use-navigation-theme';

export default function MangaLayout() {
  const { stackScreenOptions } = useNavigationTheme();

  return (
    <Stack screenOptions={{ ...stackScreenOptions, headerLargeTitle: false }}>
      <Stack.Screen name='index' options={{ headerShown: false }} />
      <Stack.Screen name='detail' options={{ title: '' }} />
    </Stack>
  );
}
