import Journal from '@/src/data/models/Journal';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalService } from '@/src/services/journal/journalDomainService';
import { JournalEntryLine, JournalId, WorkplaceId } from '@/src/types/domain';
import { useCallback } from 'react';

type SaveJournalEntryParams = Omit<
  Parameters<typeof journalService.saveJournalEntry>[0],
  'workplaceId'
>;

type BulkJournalEntry = {
  lines: JournalEntryLine[];
  description: string;
  journalDate: number;
  workplaceId: WorkplaceId;
};

/**
 * Feature write gateway for journals. Editors and details actions go through here;
 * journalService still owns orchestration and delegates persist/audit/rebuild to ledgerWriteService.
 */
export function useJournalActions(workplaceId: WorkplaceId) {
  const deleteJournal = useCallback(
    async (journal: Journal) => {
      return journalService.deleteJournal(journal.id, workplaceId);
    },
    [workplaceId],
  );

  const findJournal = useCallback(
    async (journalId: JournalId) => {
      return journalQueryRepository.find(workplaceId, journalId);
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

  const saveBulkJournalEntries = useCallback(async (entries: BulkJournalEntry[]) => {
    return journalService.saveBulkJournalEntries(entries);
  }, []);

  return {
    deleteJournal,
    findJournal,
    duplicateJournal,
    postJournal,
    revertToPlanned,
    saveJournalEntry,
    saveBulkJournalEntries,
  };
}
