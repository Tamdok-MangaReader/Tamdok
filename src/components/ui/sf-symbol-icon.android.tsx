import { Ionicons } from '@expo/vector-icons';

type SFSymbolIconProps = {
  name: string;
  size?: number;
  color: string;
  fallback: keyof typeof Ionicons.glyphMap;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
};

/** SF Symbols do not exist on Android: always render the Ionicons fallback. */
export function SFSymbolIcon({ size = 18, color, fallback }: SFSymbolIconProps) {
  return <Ionicons name={fallback} size={size} color={color} />;
}
