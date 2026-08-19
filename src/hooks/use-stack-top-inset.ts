import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STACK_HEADER_BAR = Platform.select({ ios: 44, android: 56, default: 44 }) ?? 44;

/** Top inset for content below a transparent stack header (status bar + nav bar). */
export function useStackTopInset(): number {
  const insets = useSafeAreaInsets();
  return insets.top + STACK_HEADER_BAR;
}
