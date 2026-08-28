import { journalService } from '@/src/services/journal/journalDomainService';
import { JournalEntryLine } from '@/src/types/domainJournal';
import type { PostingPlan } from '@/src/types/domainTransaction';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { useCallback } from 'react';

type SaveJournalEntryParams = Omit<
  Parameters<typeof journalService.saveJournalEntry>[0],
  'workplaceId'
>;

type PostPostingPlanParams = {
  plan: PostingPlan;
  journalId?: JournalId;
  smsId?: string;
  smsRecordId?: string;
  smsSender?: string;
  rawSmsBody?: string;
  mode?: 'simple' | 'advanced' | 'import';
};

type BulkJournalEntry = {
  lines: JournalEntryLine[];
  description: string;
  notes?: string;
  journalDate: number;
  workplaceId: WorkplaceId;
};

/**
 * Feature write gateway for journals. Editors and details actions go through here;
 * journalService still owns orchestration and delegates persist/audit/rebuild to ledgerWriteService.
 */
export function useJournalActions(workplaceId: WorkplaceId) {
  const deleteJournal = useCallback(
    async (journalId: JournalId) => {
      return journalService.deleteJournal(journalId, workplaceId);
    },
    [workplaceId],
  );

  const duplicateJournal = useCallback(
    async (journalId: JournalId) => {
      return journalService.duplicateJournal(journalId, workplaceId);
    },
    [workplaceId],
  );

  const postJournal = useCallback(
    async (journalId: JournalId) => {
      return journalService.postJournal(journalId, workplaceId);
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

  const saveBulkJournalEntries = useCallback(async (entries: BulkJournalEntry[]) => {
    return journalService.saveBulkJournalEntries(entries);
  }, []);

  return {
    deleteJournal,
    duplicateJournal,
    postJournal,
    revertToPlanned,
    saveJournalEntry,
    postPostingPlan,
    saveBulkJournalEntries,
  };
}
