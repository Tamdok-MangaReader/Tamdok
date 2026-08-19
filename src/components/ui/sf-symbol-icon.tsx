import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { Platform } from 'react-native';

type SFSymbolIconProps = {
  name: string;
  size?: number;
  color: string;
  fallback: keyof typeof Ionicons.glyphMap;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
};

export function SFSymbolIcon({
  name,
  size = 18,
  color,
  fallback,
  weight = 'regular',
}: SFSymbolIconProps) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={name as never}
        size={size}
        tintColor={color}
        weight={weight}
        fallback={<Ionicons name={fallback} size={size} color={color} />}
      />
    );
  }

  return <Ionicons name={fallback} size={size} color={color} />;
}
