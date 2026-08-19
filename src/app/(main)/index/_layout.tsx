import { Stack } from 'expo-router';

import { useNavigationTheme } from '@/hooks/use-navigation-theme';

export default function LibraryLayout() {
  const { stackScreenOptions } = useNavigationTheme();

  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name='index' />
    </Stack>
  );
}
