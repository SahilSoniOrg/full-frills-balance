import { AppSegmentedControl, AppText } from '@/src/components/core';
import { ExchangeRateCard } from '@/src/components/forms/ExchangeRateCard';
import { Spacing } from '@/src/constants';
import { plannedPaymentFormStrings as copy } from '@/src/constants/copy/domains/plannedPaymentFormStrings';
import type { FxPair } from '@/src/domain/accounting/fxPair';
import type { PlannedPaymentFxMode } from '@/src/types/plainDtos';
import { StyleSheet, View } from 'react-native';

const MODES = [
  { id: 'automatic', label: 'Automatic' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'manual', label: 'Manual' },
] as const;

export function PlannedPaymentFxCard({
  pair,
  mode,
  destinationAmount,
  onModeChange,
  onAmountChange,
  onRefresh,
  precision,
}: {
  pair: FxPair;
  mode?: PlannedPaymentFxMode;
  destinationAmount?: string;
  onModeChange: (mode: PlannedPaymentFxMode) => void;
  onAmountChange: (amount: string) => void;
  onRefresh: () => void;
  precision: number;
}) {
  if (!pair.isCrossCurrency) return null;
  return (
    <ExchangeRateCard
      pair={pair}
      destLabel={copy.to}
      precision={precision}
      editableConvertedAmount={mode === 'fixed' || mode === 'manual'}
      onConvertedAmountDraftChange={onAmountChange}
      convertedAmountValue={destinationAmount}
      onResetToApiRate={onRefresh}
      testIDPrefix="planned-payment-fx"
      header={
        <View style={styles.mode}>
          <AppSegmentedControl<PlannedPaymentFxMode | 'legacy'>
            options={MODES}
            value={mode ?? 'legacy'}
            onChange={mode => {
              if (mode !== 'legacy') onModeChange(mode);
            }}
            flex
            itemHeight={44}
            testID="planned-payment-fx-mode"
          />
        </View>
      }
      footer={
        <AppText variant="caption" color="secondary" style={styles.caption}>
          {mode === 'automatic'
            ? copy.fxAutomatic
            : mode === 'fixed'
              ? copy.fxFixed
              : mode === 'manual'
                ? copy.fxManual
                : copy.fxLegacy}
        </AppText>
      }
    />
  );
}

const styles = StyleSheet.create({
  mode: { marginBottom: Spacing.sm },
  caption: { marginTop: Spacing.sm },
});
