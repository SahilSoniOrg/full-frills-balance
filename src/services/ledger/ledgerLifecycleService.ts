import Journal from '@/src/data/models/Journal';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { JournalId, WorkplaceId } from '@/src/types/ids';

/** Transitional lifecycle façade. Journal state changes are owned by persistence service/repository. */
export class LedgerLifecycleService {
  deleteJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<void> {
    return journalPersistenceService.delete(journalId, workplaceId);
  }

  recoverJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    return journalPersistenceService.recover(journalId, workplaceId);
  }

  postJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    return journalPersistenceService.post(journalId, workplaceId);
  }

  revertToPlanned(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    return journalPersistenceService.revertToPlanned(journalId, workplaceId);
  }
}

export const ledgerLifecycleService = new LedgerLifecycleService();
