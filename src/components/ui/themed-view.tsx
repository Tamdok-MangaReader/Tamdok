import { View, type ViewProps } from 'react-native';

import { ColorToken } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  color?: ColorToken;
};

export function ThemedView({ style, color = 'systemBackground', ...rest }: ThemedViewProps) {
  const { colors } = useTheme();
  return <View style={[{ backgroundColor: colors[color] }, style]} {...rest} />;
}
