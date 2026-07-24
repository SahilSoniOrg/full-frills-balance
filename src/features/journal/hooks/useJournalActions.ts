import Journal from '@/src/data/models/Journal';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { journalService } from '@/src/services/journal/journalDomainService';
import { JournalId, WorkplaceId } from '@/src/types/domain';
import { useCallback } from 'react';

/**
 * App-facing journal mutations. All writes go through journalService, which
 * delegates persistence/audit/rebuild to ledgerWriteService.
 */
export function useJournalActions(workplaceId: WorkplaceId) {
  const createJournal = useCallback(
    async (data: CreateJournalData) => {
      return journalService.createJournal(data, workplaceId);
    },
    [workplaceId],
  );

  const deleteJournal = useCallback(
    async (journal: Journal) => {
      return journalService.deleteJournal(journal.id, workplaceId);
    },
    [workplaceId],
  );

  const findJournal = useCallback(
    async (journalId: JournalId) => {
      return journalRepository.find(workplaceId, journalId);
    },
    [workplaceId],
  );

  const updateJournal = useCallback(
    async (journalId: JournalId, data: CreateJournalData) => {
      return journalService.updateJournal(journalId, data, workplaceId);
    },
    [workplaceId],
  );

  const recoverJournal = useCallback(
    async (journalId: JournalId) => {
      return journalService.recoverJournal(journalId, workplaceId);
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

  return {
    createJournal,
    updateJournal,
    deleteJournal,
    recoverJournal,
    findJournal,
    duplicateJournal,
    postJournal,
    revertToPlanned,
  };
}
