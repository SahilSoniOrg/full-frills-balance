import { JournalStatus, WorkplaceId } from '@/src/types/domain';
import { useJournals } from '@/src/features/journal';
import { usePlannedPaymentRecord } from '@/src/features/planned-payments/hooks/usePlannedPaymentRecord';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import { deletePlannedPayment } from '@/src/services/planned-payment/plannedPaymentCommands';
import { togglePlannedPaymentStatus } from '@/src/services/planned-payment/plannedPaymentLifecycle';
import {
  postPlannedPaymentOccurrence,
  skipPlannedPaymentOccurrence,
} from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { analytics } from '@/src/services/analytics-service';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

export function usePlannedPaymentDetails(id: string, workplaceId: WorkplaceId) {
  const { item, isLoading: isItemLoading } = usePlannedPaymentRecord(workplaceId, id);

  // Fetch history (linked journals)
  // We use a separate status filter to show both POSTED (past) and PLANNED (future generated) journals
  const { journals: history, isLoading: isHistoryLoading } = useJournals(
    workplaceId,
    20,
    undefined,
    undefined,
    [JournalStatus.POSTED, JournalStatus.PLANNED, JournalStatus.SKIPPED, JournalStatus.PAUSED],
    id,
  );

  const handleEdit = useCallback(() => {
    if (id) {
      AppNavigation.toPlannedPaymentForm(
        id,
        item
          ? {
              description: item.name,
              amount: item.amount,
              currency: item.currencyCode,
            }
          : undefined,
      );
    }
  }, [id, item]);

  const handleToggleStatus = useCallback(async () => {
    if (!item) return;
    const record = await plannedPaymentReadService.find(workplaceId, item.id);
    if (!record) return;
    const newStatus = await togglePlannedPaymentStatus(workplaceId, record);

    // Track Analytics
    analytics.trackFeatureUsage('planned_payment', 'toggle_status', {
      payment_id: item.id,
      new_status: newStatus,
      previous_status: item.status,
    });
  }, [item, workplaceId]);

  const handleDelete = useCallback(async () => {
    if (!item) return;
    const record = await plannedPaymentReadService.find(workplaceId, item.id);
    if (!record) return;
    await deletePlannedPayment(workplaceId, record);

    // Track Analytics
    analytics.trackFeatureUsage('planned_payment', 'delete', {
      payment_id: item.id,
      payment_name: item.name,
      amount: item.amount,
    });

    AppNavigation.back();
  }, [item, workplaceId]);

  const handlePostNow = useCallback(async () => {
    if (!item) return;
    try {
      const record = await plannedPaymentReadService.find(workplaceId, item.id);
      if (!record) return;
      await postPlannedPaymentOccurrence(workplaceId, record, item.nextOccurrence);

      // Track Analytics
      analytics.trackFeatureUsage('planned_payment', 'post_now', {
        payment_id: item.id,
        amount: item.amount,
        currency: item.currencyCode,
        next_occurrence: item.nextOccurrence,
      });

      AppNavigation.back();
    } catch {
      // Error logged in service
    }
  }, [item, workplaceId]);

  const handleSkip = useCallback(async () => {
    if (!item) return;
    try {
      const record = await plannedPaymentReadService.find(workplaceId, item.id);
      if (!record) return;
      await skipPlannedPaymentOccurrence(workplaceId, record, item.nextOccurrence);

      // Track Analytics
      analytics.trackFeatureUsage('planned_payment', 'skip', {
        payment_id: item.id,
        amount: item.amount,
        next_occurrence: item.nextOccurrence,
      });

      AppNavigation.back();
    } catch {
      // Error logged in service
    }
  }, [item, workplaceId]);

  return {
    item,
    history,
    isLoading: isItemLoading || isHistoryLoading,
    handleEdit,
    handleToggleStatus,
    handleDelete,
    handlePostNow,
    handleSkip,
  };
}
