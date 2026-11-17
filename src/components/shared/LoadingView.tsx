import { AppText } from '@/src/components/core/AppText';
import { Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { useTheme } from '@/src/hooks/use-theme';
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';

export interface LoadingViewProps {
  loading: boolean;
  text?: string;
  size?: 'small' | 'large';
  /** `inline` sits inside a section or scroll content instead of filling the screen. */
  variant?: 'screen' | 'inline';
  style?: ViewStyle;
}

export function LoadingView({
  loading,
  text = AppConfig.strings.common.loading,
  size,
  variant = 'screen',
  style,
}: LoadingViewProps) {
  const { theme } = useTheme();
  if (!loading) return null;

  const inline = variant === 'inline';
  return (
    <View
      style={[inline ? styles.inline : styles.screen, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={text}
    >
      <ActivityIndicator size={size ?? (inline ? 'small' : 'large')} color={theme.primary} />
      <AppText variant={inline ? 'bodySmall' : 'body'} color="secondary">
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
