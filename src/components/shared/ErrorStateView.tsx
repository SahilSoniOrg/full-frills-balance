import { AppButton } from '@/src/components/core/AppButton';
import { AppText } from '@/src/components/core/AppText';
import { Spacing } from '@/src/constants';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

export interface ErrorStateViewProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** `inline` sits inside a card or section instead of filling the screen. */
  variant?: 'screen' | 'inline';
  style?: StyleProp<ViewStyle>;
}

export function ErrorStateView({
  message,
  onRetry,
  retryLabel = 'Try again',
  variant = 'screen',
  style,
}: ErrorStateViewProps) {
  const inline = variant === 'inline';
  return (
    <View style={[inline ? styles.inline : styles.screen, style]} accessibilityRole="alert">
      <AppText
        variant="body"
        color={inline ? 'warning' : 'error'}
        style={inline ? undefined : styles.centered}
      >
        {message}
      </AppText>
      {onRetry ? (
        <AppButton
          variant={inline ? 'secondary' : 'primary'}
          size={inline ? 'sm' : 'md'}
          onPress={onRetry}
        >
          {retryLabel}
        </AppButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  inline: { gap: Spacing.sm, alignItems: 'flex-start' },
  centered: { textAlign: 'center' },
});
