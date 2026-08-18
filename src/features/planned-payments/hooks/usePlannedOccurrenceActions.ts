import { formatMoneyAmount } from '@/src/utils/moneyFormat';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import type { PlannedOccurrenceViewModel } from '@/src/features/planned-payments/types/PlannedOccurrenceViewModel';
import {
  postPlannedPaymentOccurrence,
  skipPlannedPaymentOccurrence,
} from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import { analytics } from '@/src/services/analytics-service';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { confirm, showErrorAlert, toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

/**
 * Actions for tapping a planned occurrence (record / skip / open journal entry).
 * Shared by Dashboard (and other planned-occurrence surfaces).
 */
export function usePlannedOccurrenceActions(workplaceId: WorkplaceId) {
  const isPrivacyMode = useEffectivePrivacyMode();

  const onPlannedJournalPress = useCallback(
    async (item: PlannedOccurrenceViewModel) => {
      const sourceAcc = item.accounts.find(a => a.role === 'SOURCE');
      const destAcc = item.accounts.find(a => a.role === 'DESTINATION');

      let type: 'expense' | 'income' | 'transfer' = 'expense';
      if (destAcc?.accountType === 'LIABILITY' || destAcc?.accountType === 'ASSET') {
        type = 'transfer';
      } else if (sourceAcc?.accountType === 'INCOME') {
        type = 'income';
      } else if (destAcc?.accountType === 'EXPENSE') {
        type = 'expense';
      } else {
        type = (String(item.displayType).toLowerCase() || 'expense') as
          'expense' | 'income' | 'transfer';
      }

      const displayAmount = formatMoneyAmount(item.amount, item.currencyCode, isPrivacyMode);
      const displayTitle = item.title;
      const isSimulated = item.origin === 'SIMULATED_LIABILITY';

      const primaryLabel = type === 'income' ? 'Receive' : type === 'transfer' ? 'Transfer' : 'Pay';
      const dialogTitle =
        type === 'income'
          ? 'Record Income'
          : type === 'transfer'
            ? 'Record Transfer'
            : 'Record Payment';

      if (!isSimulated && item.origin === 'PLANNED_JOURNAL' && item.plannedPaymentId) {
        const plannedPaymentId = item.plannedPaymentId as PlannedPaymentId;
        confirm.show({
          title: dialogTitle,
          message: `Do you want to record a payment of ${displayAmount} for ${displayTitle}?`,
          confirmText: primaryLabel,
          cancelText: 'Skip',
          destructiveCancel: true,
          onConfirm: async () => {
            try {
              const pp = await plannedPaymentReadService.find(workplaceId, plannedPaymentId);
              if (pp) {
                await postPlannedPaymentOccurrence(workplaceId, pp, item.occurrenceDate);
                analytics.trackFeatureUsage('planned_payment', 'occurrence_paid', {
                  payment_id: plannedPaymentId,
                  currency: item.currencyCode,
                  is_simulated: false,
                });
                toast.success('Payment recorded successfully');
              } else {
                toast.error('Planned payment details not found');
              }
            } catch (err) {
              showErrorAlert(err);
            }
          },
          onCancel: async () => {
            confirm.show({
              title: 'Skip Occurrence',
              message: `Are you sure you want to skip the occurrence for ${displayTitle}?`,
              confirmText: 'Skip',
              cancelText: 'Cancel',
              destructive: true,
              onConfirm: async () => {
                try {
                  const pp = await plannedPaymentReadService.find(workplaceId, plannedPaymentId);
                  if (pp) {
                    await skipPlannedPaymentOccurrence(workplaceId, pp, item.occurrenceDate);
                    analytics.trackFeatureUsage('planned_payment', 'occurrence_skipped', {
                      payment_id: plannedPaymentId,
                      is_simulated: false,
                    });
                    toast.success('Payment skipped successfully');
                  } else {
                    toast.error('Planned payment details not found');
                  }
                } catch (err) {
                  showErrorAlert(err);
                }
              },
              onCancel: () => {},
              onClose: () => {},
            });
          },
          onClose: () => {},
        });
      } else {
        confirm.show({
          title: dialogTitle,
          message: `Do you want to record a payment of ${displayAmount} for ${displayTitle}?`,
          confirmText: primaryLabel,
          cancelText: 'Cancel',
          onConfirm: () => {
            AppNavigation.toSimpleJournalEntry(type, {
              sourceAccountId: sourceAcc?.id,
              destinationAccountId: destAcc?.id,
              amount: String(item.amount),
              journalId: item.origin === 'PLANNED_JOURNAL' ? item.journalId : undefined,
            });
          },
          onCancel: () => {},
          onClose: () => {},
        });
      }
    },
    [workplaceId, isPrivacyMode],
  );

  return { onPlannedJournalPress };
}
