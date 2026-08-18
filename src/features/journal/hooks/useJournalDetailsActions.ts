import { formatMoneyAmount } from '@/src/utils/moneyFormat';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { confirm, showConfirmationAlert, showErrorAlert, toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { logger } from '@/src/utils/logger';
import { useCallback, useRef } from 'react';
import {
  isOrphanedPendingJournal,
  orphanedPendingJournalConfirmCopy,
  resolveRevertPlannedActionLabels,
} from '@/src/services/journal/journalDetailsHelpers';

interface UseTransactionDetailsActionsProps {
  workplaceId: WorkplaceId;
  journalId: JournalId;
  amount: number;
  currencyCode: string;
  status?: string;
  plannedPaymentId?: string;
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
  const { deleteJournal, findJournal, duplicateJournal, postJournal, revertToPlanned } =
    useJournalActions(workplaceId);
  const isPrivacyMode = useEffectivePrivacyMode();
  const displayAmount = formatMoneyAmount(amount, currencyCode, isPrivacyMode);

  const handleDelete = useCallback(() => {
    showConfirmationAlert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction? This action cannot be undone.',
      async () => {
        try {
          const found = await findJournal(journalId);
          if (!found) {
            showErrorAlert('Transaction not found. It may have already been deleted.');
            AppNavigation.back();
            return;
          }
          await deleteJournal(found);
          toast.success('Transaction has been deleted.');
          AppNavigation.back();
        } catch (error) {
          logger.error('Failed to delete transaction:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not delete transaction: ${errorMessage}`);
        }
      },
    );
  }, [deleteJournal, findJournal, journalId]);

  const handleCopy = useCallback(async () => {
    try {
      const newJournal = await duplicateJournal(journalId);
      toast.success('New transaction created from copy.');
      AppNavigation.toJournalEntry({ journalId: newJournal.id });
    } catch (error) {
      logger.error('Failed to copy transaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showErrorAlert(`Could not copy transaction: ${errorMessage}`);
    }
  }, [duplicateJournal, journalId]);

  const handlePost = useCallback(async () => {
    if (status !== 'PLANNED') return;

    showConfirmationAlert(
      'Post Transaction',
      `Are you sure you want to mark this planned transaction for ${displayAmount} as posted?`,
      async () => {
        try {
          await postJournal(journalId);
          toast.success('Transaction has been marked as posted.');
          AppNavigation.back();
        } catch (error) {
          logger.error('Failed to post transaction:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not post transaction: ${errorMessage}`);
        }
      },
    );
  }, [displayAmount, journalId, postJournal, status]);

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
    if (status !== 'PLANNED' || !plannedPaymentId || journalDate === undefined) return;

    showConfirmationAlert(
      'Skip Transaction',
      `Are you sure you want to skip this planned transaction for ${displayAmount}? The schedule will advance to the next occurrence.`,
      async () => {
        try {
          const plannedPayment = await plannedPaymentReadService.find(
            workplaceId,
            plannedPaymentId as PlannedPaymentId,
          );
          if (!plannedPayment) throw new Error('Planned payment rule not found.');
          await plannedPaymentService.skipOccurrence(workplaceId, plannedPayment, journalDate);
          toast.success('Transaction has been skipped.');
          AppNavigation.back();
        } catch (error) {
          logger.error('Failed to skip transaction:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not skip transaction: ${errorMessage}`);
        }
      },
    );
  }, [displayAmount, journalDate, plannedPaymentId, status, workplaceId]);

  const orphanPromptedRef = useRef(false);
  const promptOrphanIfNeeded = useCallback(async () => {
    if (orphanPromptedRef.current || status !== 'PLANNED' || !plannedPaymentId) return;

    const plannedPayment = await plannedPaymentReadService.find(
      workplaceId,
      plannedPaymentId as PlannedPaymentId,
    );
    if (
      !isOrphanedPendingJournal({
        status,
        plannedPaymentId,
        plannedPaymentExists: Boolean(plannedPayment),
      })
    ) {
      return;
    }

    orphanPromptedRef.current = true;
    const copy = orphanedPendingJournalConfirmCopy();
    confirm.show({
      ...copy,
      destructive: true,
      onConfirm: async () => {
        try {
          const found = await findJournal(journalId);
          if (!found) {
            showErrorAlert('Transaction not found. It may have already been deleted.');
            AppNavigation.back();
            return;
          }
          await deleteJournal(found);
          toast.success('Orphaned scheduled journal deleted.');
          AppNavigation.back();
        } catch (error) {
          logger.error('Failed to delete orphaned planned journal:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not delete transaction: ${errorMessage}`);
        }
      },
      onCancel: async () => {
        try {
          await postJournal(journalId);
          toast.success('Transaction has been marked as posted.');
          AppNavigation.back();
        } catch (error) {
          logger.error('Failed to post orphaned planned journal:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not post transaction: ${errorMessage}`);
        }
      },
      onClose: () => {},
    });
  }, [deleteJournal, findJournal, journalId, plannedPaymentId, postJournal, status, workplaceId]);

  return {
    handleDelete,
    handleCopy,
    handlePost,
    handleRevertToScheduled,
    handleSkip,
    promptOrphanIfNeeded,
  };
}
