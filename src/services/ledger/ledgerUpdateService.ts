import Journal from '@/src/data/models/Journal';
import type { CreateJournalData } from '@/src/types/journalWrite';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { JournalId, WorkplaceId } from '@/src/types/ids';

/** Transitional update API; persistence and posted-balance enforcement live in the journal boundary. */
export class LedgerUpdateService {
  updateJournal(
    journalId: JournalId,
    data: CreateJournalData,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    return journalPersistenceService.put({ ...data, journalId }, workplaceId);
  }
}

export const ledgerUpdateService = new LedgerUpdateService();
