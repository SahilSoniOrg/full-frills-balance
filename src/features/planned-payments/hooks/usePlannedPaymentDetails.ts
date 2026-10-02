import { JournalStatus } from '@/src/types/enums';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { useJournals } from '@/src/features/journal';
import { usePlannedPaymentRecord } from '@/src/features/planned-payments/hooks/usePlannedPaymentRecord';
import { deletePlannedPayment } from '@/src/services/planned-payment/plannedPaymentCommands';
import { togglePlannedPaymentStatus } from '@/src/services/planned-payment/plannedPaymentLifecycle';
import {
  postPlannedJournalOccurrence,
  postPlannedPaymentOccurrence,
  skipPlannedPaymentOccurrence,
} from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { analytics } from '@/src/services/analytics';
import { resolvePlannedPaymentActionTarget } from '@/src/features/planned-payments/hooks/plannedPaymentDetailsActions';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useRef, useState } from 'react';
import { useObservable } from '@/src/hooks/useObservable';
import { plannedPaymentDetailService } from '@/src/services/planned-payment/plannedPaymentDetailService';
import type { PlainJournal } from '@/src/types/plainDtos';
import { toast } from '@/src/utils/alerts';
import { of } from 'rxjs';

type PendingAction = 'record' | 'skip' | 'toggle' | 'delete';

const ACTION_ERRORS: Record<PendingAction, string> = {
  record: 'Could not record this occurrence. Try again.',
  skip: 'Could not skip this occurrence. Try again.',
  toggle: 'Could not update the schedule. Try again.',
  delete: 'Could not delete this schedule. Try again.',
};

export function usePlannedPaymentDetails(id: string, workplaceId: WorkplaceId) {
  const { item, isLoading: isItemLoading } = usePlannedPaymentRecord(workplaceId, id);
  const {
    data: activity,
    isLoading: isLoadingActivity,
    error: activityError,
    retry: retryActivity,
  } = useObservable<PlainJournal[] | null>(
    () =>
      id
        ? plannedPaymentDetailService.observeActivity(workplaceId, id as PlannedPaymentId)
        : of(null),
    [id, workplaceId],
    null,
    { keepPreviousData: false },
  );
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const actionLock = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const runAction = useCallback(
    async (
      action: PendingAction,
      operation: () => Promise<void>,
      successMessage?: string,
    ) => {
      if (actionLock.current) return;
      actionLock.current = true;
      setPendingAction(action);
      setActionError(null);
      try {
        await operation();
        if (successMessage) toast.success(successMessage);
      } catch {
        setActionError(ACTION_ERRORS[action]);
      } finally {
        actionLock.current = false;
        setPendingAction(null);
      }
    },
    [],
  );

  // Fetch history (linked journals)
  // We use a separate status filter to show both POSTED (past) and PLANNED (future generated) journals
  const {
    journals: history,
    isLoading: isHistoryLoading,
    isLoadingMore,
    hasMore,
    loadMore,
  } = useJournals(
    workplaceId,
    20,
    undefined,
    undefined,
    [
      JournalStatus.POSTED,
      JournalStatus.REVERSED,
      JournalStatus.PLANNED,
      JournalStatus.SKIPPED,
      JournalStatus.PAUSED,
    ],
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
    await runAction('toggle', async () => {
      const newStatus = await togglePlannedPaymentStatus(workplaceId, item.id);

      // Track Analytics
      analytics.trackFeatureUsage('planned_payment', 'toggle_status', {
        payment_id: item.id,
        new_status: newStatus,
        previous_status: item.status,
      });
    });
  }, [item, workplaceId, runAction]);

  const handleDelete = useCallback(async () => {
    if (!item) return;
    await runAction('delete', async () => {
      await deletePlannedPayment(workplaceId, item.id);

      // Track Analytics
      analytics.trackFeatureUsage('planned_payment', 'delete', {
        payment_id: item.id,
        payment_name: item.name,
        amount: item.amount,
      });

      AppNavigation.back();
    });
  }, [item, workplaceId, runAction]);

  const handlePostNow = useCallback(async () => {
    if (!item) return;
    const target = resolvePlannedPaymentActionTarget(item);
    if (!target) return;
    await runAction(
      'record',
      async () => {
        if (target.journalId) {
          await postPlannedJournalOccurrence(
            workplaceId,
            item.id,
            target.journalId,
            target.occurrenceDate,
          );
        } else {
          await postPlannedPaymentOccurrence(workplaceId, item.id, target.occurrenceDate);
        }

        // Track Analytics
        analytics.trackFeatureUsage('planned_payment', 'post_now', {
          payment_id: item.id,
          amount: item.amount,
          currency: item.currencyCode,
          next_occurrence: target.occurrenceDate,
        });
      },
      'Occurrence recorded',
    );
  }, [item, workplaceId, runAction]);

  const handleSkip = useCallback(async () => {
    if (!item) return;
    const target = resolvePlannedPaymentActionTarget(item);
    if (!target) return;
    await runAction(
      'skip',
      async () => {
        await skipPlannedPaymentOccurrence(workplaceId, item.id, target.occurrenceDate);

        // Track Analytics
        analytics.trackFeatureUsage('planned_payment', 'skip', {
          payment_id: item.id,
          amount: item.amount,
          next_occurrence: target.occurrenceDate,
        });
      },
      'Occurrence skipped',
    );
  }, [item, workplaceId, runAction]);

  return {
    item,
    history,
    isLoading: isItemLoading,
    isLoadingHistory: isHistoryLoading,
    activity,
    isLoadingActivity,
    activityError,
    retryActivity,
    pendingAction,
    actionError,
    isLoadingMore,
    hasMore,
    loadMore,
    handleEdit,
    handleToggleStatus,
    handleDelete,
    handlePostNow,
    handleSkip,
  };
}
