import { Stack } from 'expo-router';

import { useNavigationTheme } from '@/hooks/use-navigation-theme';

export default function Layout() {
  const { stackScreenOptions } = useNavigationTheme();

  return <Stack screenOptions={stackScreenOptions} />;
}
