import { AppButton } from '@/src/components/core';
import { AppConfig } from '@/src/constants';

export function ReportsV2MissingRatesAction({
  onPress,
  loading,
  disabled,
}: {
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <AppButton
      variant="secondary"
      onPress={onPress}
      loading={loading}
      disabled={disabled || loading}
      accessibilityLabel={AppConfig.strings.reportsV2.fetchMissingRates}
    >
      {AppConfig.strings.reportsV2.fetchMissingRates}
    </AppButton>
  );
}
