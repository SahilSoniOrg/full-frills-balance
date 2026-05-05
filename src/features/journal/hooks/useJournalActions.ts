import Journal from '@/src/data/models/Journal';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { journalService } from '@/src/features/journal/services/JournalService';
import { ledgerWriteService } from '@/src/services/ledger';
import { useCallback } from 'react';
import { WorkplaceId } from '@/src/types/domain';

export function useJournalActions(workplaceId: WorkplaceId) {
  const createJournal = useCallback(
    async (data: CreateJournalData) => {
      return ledgerWriteService.createJournal(data, workplaceId);
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
    async (journalId: string) => {
      return journalRepository.find(workplaceId, journalId);
    },
    [workplaceId],
  );

  const updateJournal = useCallback(
    async (journalId: string, data: CreateJournalData) => {
      return journalService.updateJournal(journalId, data, workplaceId);
    },
    [workplaceId],
  );

  const duplicateJournal = useCallback(
    async (journalId: string) => {
      return journalService.duplicateJournal(journalId, workplaceId);
    },
    [workplaceId],
  );

  const postJournal = useCallback(
    async (journalId: string) => {
      return journalService.postJournal(journalId, workplaceId);
    },
    [workplaceId],
  );

  const revertToPlanned = useCallback(
    async (journalId: string) => {
      return journalService.revertToPlanned(journalId, workplaceId);
    },
    [workplaceId],
  );

  return {
    createJournal,
    updateJournal,
    deleteJournal,
    findJournal,
    duplicateJournal,
    postJournal,
    revertToPlanned,
  };
}
