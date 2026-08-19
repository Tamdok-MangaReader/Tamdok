import { useLocalSearchParams } from 'expo-router';

import { InstalledSourceSettings } from '@/components/sources/installed-source-settings';

function decodeSourceRouteId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export default function SourceSettingsScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  return <InstalledSourceSettings sourceRouteId={decodeSourceRouteId(rawId ?? '')} />;
}
