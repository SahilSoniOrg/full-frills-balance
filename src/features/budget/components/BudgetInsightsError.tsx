import { AppButton, AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { StyleSheet, View } from 'react-native';

export function BudgetInsightsError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const strings = AppConfig.strings.budgetDetailRedesign;
  return (
    <View style={styles.errorState}>
      <AppText variant="caption" color="warning">
        {message}
      </AppText>
      <AppButton variant="secondary" onPress={onRetry} accessibilityLabel={strings.retryBreakdown}>
        {strings.retryBreakdown}
      </AppButton>
    </View>
  );
}

const styles = StyleSheet.create({
  errorState: { gap: Spacing.sm, alignItems: 'flex-start' },
});
