import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform } from 'react-native';

export const liquidGlassScrollEdgeEffects = {
  top: 'soft',
} as const;

export function isGlassSupported(): boolean {
  return Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
}

export function isIOS(): boolean {
  return Platform.OS === 'ios';
}
