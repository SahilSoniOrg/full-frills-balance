import { journalService } from '@/src/services/journal/journalDomainService';
import type { PostingPlan } from '@/src/types/domainTransaction';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import type { PlannedPaymentFxReview } from '@/src/services/planned-payment/plannedPaymentFx';
import { useCallback } from 'react';

type SaveJournalEntryParams = Omit<
  Parameters<typeof journalService.saveJournalEntry>[0],
  'workplaceId'
>;

type PostPostingPlanParams = {
  plan: PostingPlan;
  journalId?: JournalId;
  newJournalCurrencyCode?: string;
  smsId?: string;
  smsRecordId?: string;
  mode?: 'simple' | 'advanced' | 'import';
  launchSource?: string;
};

/**
 * Feature write gateway for journals. Editors and details actions go through here;
 * journalService still owns orchestration and delegates persist/audit/rebuild to the ledger services.
 */
export function useJournalActions(workplaceId: WorkplaceId) {
  const deleteJournal = useCallback(
    async (journalId: JournalId) => {
      return journalService.deleteJournal(journalId, workplaceId);
    },
    [workplaceId],
  );

  const postJournal = useCallback(
    async (journalId: JournalId, review?: PlannedPaymentFxReview) => {
      return review
        ? journalService.postJournal(
            journalId,
            workplaceId,
            undefined,
            undefined,
            undefined,
            review,
          )
        : journalService.postJournal(journalId, workplaceId);
    },
    [workplaceId],
  );

  const revertToPlanned = useCallback(
    async (journalId: JournalId) => {
      return journalService.revertToPlanned(journalId, workplaceId);
    },
    [workplaceId],
  );

  const saveJournalEntry = useCallback(
    async (params: SaveJournalEntryParams) => {
      return journalService.saveJournalEntry({ ...params, workplaceId });
    },
    [workplaceId],
  );

  const postPostingPlan = useCallback(
    async (params: PostPostingPlanParams) => {
      return journalService.postPostingPlan({ ...params, workplaceId });
    },
    [workplaceId],
  );

  return {
    deleteJournal,
    postJournal,
    revertToPlanned,
    saveJournalEntry,
    postPostingPlan,
  };
}
