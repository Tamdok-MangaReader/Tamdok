// Android has no Liquid Glass: keep the same API but never touch expo-glass-effect.
export const liquidGlassScrollEdgeEffects = {
  top: "soft",
} as const;

export function isGlassSupported(): boolean {
  return false;
}

export function isIOS(): boolean {
  return false;
}
