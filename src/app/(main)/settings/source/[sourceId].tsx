import { useLocalSearchParams } from 'expo-router';

import { InstalledSourceSettings } from '@/components/sources/installed-source-settings';

export default function InstalledSourceSettingsScreen() {
  const { sourceId: rawSourceId } = useLocalSearchParams<{ sourceId: string }>();
  const sourceRouteId = decodeURIComponent(rawSourceId ?? '');
  return <InstalledSourceSettings sourceRouteId={sourceRouteId} />;
}
