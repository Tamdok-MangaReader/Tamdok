import { Stack } from 'expo-router';

import { useNavigationTheme } from '@/hooks/use-navigation-theme';

export default function SourcesLayout() {
  const { stackScreenOptions } = useNavigationTheme();

  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name='index' />
      <Stack.Screen name='[id]/index' options={{ headerLargeTitle: false, title: '' }} />
      <Stack.Screen name='[id]/settings' options={{ headerLargeTitle: false, title: '' }} />
      <Stack.Screen name='[id]/search' options={{ headerShown: false, animation: 'fade_from_bottom' }} />
      <Stack.Screen name='[id]/listing' options={{ headerLargeTitle: false, title: '' }} />
    </Stack>
  );
}
