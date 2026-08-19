import { Text, type TextProps } from 'react-native';

import { ColorToken, TypographyToken } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  variant?: TypographyToken;
  color?: ColorToken;
};

export function ThemedText({ style, variant = 'body', color = 'label', ...rest }: ThemedTextProps) {
  const { colors, typography } = useTheme();

  return <Text style={[typography[variant], { color: colors[color] }, style]} {...rest} />;
}
