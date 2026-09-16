import { AppButton } from '@/src/components/core/AppButton';
import { AppText } from '@/src/components/core/AppText';
import { Spacing } from '@/src/constants';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

export interface ErrorStateViewProps {
  message: string;
  onRetry: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ErrorStateView({ message, onRetry, style }: ErrorStateViewProps) {
  return (
    <View style={[styles.container, style]} accessibilityRole="alert">
      <AppText variant="body" color="error" style={styles.message}>
        {message}
      </AppText>
      <AppButton onPress={onRetry}>Try again</AppButton>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  message: {
    textAlign: 'center',
  },
});
