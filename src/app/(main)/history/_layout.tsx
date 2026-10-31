import { Stack } from 'expo-router';

import { duoScreenLayout } from "@/hooks/use-duo-layout";
import { useNavigationTheme } from '@/hooks/use-navigation-theme';

export default function Layout() {
  const { stackScreenOptions } = useNavigationTheme();

  return <Stack screenOptions={stackScreenOptions} screenLayout={duoScreenLayout} />;
}
