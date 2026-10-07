import { recordPlannedOccurrenceWithFxReview } from '@/src/services/planned-payment/recordPlannedOccurrenceWithFxReview';
import { withPlannedPaymentFxReview } from '@/src/services/planned-payment/plannedPaymentFxReviewRequest';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { skipPlannedPaymentOccurrence } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { showConfirmationAlert, showErrorAlert, toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { logger } from '@/src/utils/logger';
import { useCallback, useRef, useState } from 'react';
import { resolveRevertPlannedActionLabels } from '@/src/services/journal/journalDetailsHelpers';

interface UseTransactionDetailsActionsProps {
  workplaceId: WorkplaceId;
  journalId: JournalId;
  amount: number;
  currencyCode: string;
  status?: string;
  plannedPaymentId?: PlannedPaymentId;
  journalDate?: number;
}

export function useJournalDetailsActions({
  workplaceId,
  journalId,
  amount,
  currencyCode,
  status,
  plannedPaymentId,
  journalDate,
}: UseTransactionDetailsActionsProps) {
  const { deleteJournal, postJournal, revertToPlanned } = useJournalActions(workplaceId);
  const isPrivacyMode = useEffectivePrivacyMode();
  const displayAmount = formatMoneyAmount(amount, currencyCode, isPrivacyMode);
  const [pendingAction, setPendingAction] = useState<'post' | 'skip' | null>(null);
  const actionLock = useRef(false);

  const runExclusive = useCallback(async (action: 'post' | 'skip', work: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setPendingAction(action);
    try {
      await work();
    } finally {
      actionLock.current = false;
      setPendingAction(null);
    }
  }, []);

  const handleDelete = useCallback(() => {
    showConfirmationAlert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction? This action cannot be undone.',
      async () => {
        try {
          await deleteJournal(journalId);
          toast.success('Transaction has been deleted.');
          AppNavigation.back();
        } catch (error) {
          logger.error('Failed to delete transaction:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not delete transaction: ${errorMessage}`);
        }
      },
    );
  }, [deleteJournal, journalId]);

  const handleCopy = useCallback(() => {
    AppNavigation.toJournalEntry({ params: { copyJournalId: journalId } });
  }, [journalId]);

  const handlePost = useCallback(async () => {
    if (status !== 'PLANNED' || actionLock.current) return;

    showConfirmationAlert(
      'Post Transaction',
      `Are you sure you want to mark this planned transaction for ${displayAmount} as posted?`,
      () =>
        runExclusive('post', async () => {
          try {
            const completed =
              plannedPaymentId && journalDate !== undefined
                ? await recordPlannedOccurrenceWithFxReview(
                    workplaceId,
                    plannedPaymentId,
                    journalDate,
                    journalId,
                  )
                : await withPlannedPaymentFxReview(review =>
                    review ? postJournal(journalId, review) : postJournal(journalId),
                  );
            if (!completed) return;
            toast.success('Transaction has been marked as posted.');
            AppNavigation.back();
          } catch (error) {
            logger.error('Failed to post transaction:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showErrorAlert(`Could not post transaction: ${errorMessage}`);
          }
        }),
    );
  }, [
    displayAmount,
    journalDate,
    journalId,
    plannedPaymentId,
    postJournal,
    runExclusive,
    status,
    workplaceId,
  ]);

  const handleRevertToScheduled = useCallback(async () => {
    const { actionLabel, statusLabel } = resolveRevertPlannedActionLabels(status || '');
    if (status !== 'POSTED' && status !== 'SKIPPED') return;

    showConfirmationAlert(
      `${actionLabel} Transaction`,
      `Are you sure you want to revert this ${statusLabel} transaction for ${displayAmount} back to scheduled status?`,
      async () => {
        try {
          await revertToPlanned(journalId);
          toast.success('Transaction has been reverted to scheduled status.');
          AppNavigation.back();
        } catch (error) {
          logger.error(`Failed to ${actionLabel.toLowerCase()} transaction:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not ${actionLabel.toLowerCase()} transaction: ${errorMessage}`);
        }
      },
    );
  }, [displayAmount, journalId, revertToPlanned, status]);

  const handleSkip = useCallback(async () => {
    if (
      status !== 'PLANNED' ||
      !plannedPaymentId ||
      journalDate === undefined ||
      actionLock.current
    )
      return;

    showConfirmationAlert(
      'Skip Transaction',
      `Are you sure you want to skip this planned transaction for ${displayAmount}? The schedule will advance to the next occurrence.`,
      () =>
        runExclusive('skip', async () => {
          try {
            await skipPlannedPaymentOccurrence(workplaceId, plannedPaymentId, journalDate);
            toast.success('Transaction has been skipped.');
            AppNavigation.back();
          } catch (error) {
            logger.error('Failed to skip transaction:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showErrorAlert(`Could not skip transaction: ${errorMessage}`);
          }
        }),
    );
  }, [displayAmount, journalDate, plannedPaymentId, runExclusive, status, workplaceId]);

  return {
    handleDelete,
    handleCopy,
    handlePost,
    handleRevertToScheduled,
    handleSkip,
    pendingAction,
  };
}
