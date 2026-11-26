import { AppButton, AppCard, AppText } from '@/src/components/core';
import { ModalHost } from '@/src/components/overlays/ModalHost';
import { Spacing } from '@/src/constants/design-tokens';
import type { PersonBalanceSummary } from '@/src/domain/people/personTypes';
import { View } from 'react-native';

type Props = {
  visible: boolean;
  personName: string;
  summary: PersonBalanceSummary;
  workplaceCurrency: string;
  closingResidual: number;
  forgivenAccountName: string;
  forgivenAccountType: 'Expense' | 'Income';
  blockedReason?: string;
  formatAmount?: (amount: number, currencyCode: string) => string;
  onCancel: () => void;
  onConfirm: () => void;
};
export function WeAreSettledPreviewModal({
  visible,
  personName,
  summary,
  workplaceCurrency,
  closingResidual,
  forgivenAccountName,
  forgivenAccountType,
  blockedReason,
  formatAmount = (amount, currency) => `${currency} ${amount.toFixed(2)}`,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <ModalHost visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'center', padding: Spacing.lg }}>
        <AppCard>
          <View style={{ gap: Spacing.sm }}>
            <AppText variant="title">Settle with {personName}</AppText>
            {summary.currencies.map(b => (
              <View key={b.currencyCode}>
                <AppText>
                  {personName} owes you: {formatAmount(b.owedToYou, b.currencyCode)}
                </AppText>
                <AppText>
                  You owe {personName}: {formatAmount(b.youOwe, b.currencyCode)}
                </AppText>
                <AppText>Net: {formatAmount(b.net, b.currencyCode)}</AppText>
              </View>
            ))}
            {summary.convertedNet?.isInformational && (
              <AppText color="secondary">
                Est. net ~
                {formatAmount(summary.convertedNet.amount, summary.convertedNet.currencyCode)}{' '}
                (informational)
              </AppText>
            )}
            <AppText>
              Closing residual ({workplaceCurrency}):{' '}
              {formatAmount(closingResidual, workplaceCurrency)} forgiven to {forgivenAccountName} (
              {forgivenAccountType})
            </AppText>
            {blockedReason && (
              <AppText accessibilityRole="alert">
                Negative unassigned remainder: {blockedReason}
              </AppText>
            )}
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <AppButton onPress={onCancel}>Cancel</AppButton>
              <AppButton onPress={onConfirm} disabled={Boolean(blockedReason)}>
                Confirm
              </AppButton>
            </View>
          </View>
        </AppCard>
      </View>
    </ModalHost>
  );
}
