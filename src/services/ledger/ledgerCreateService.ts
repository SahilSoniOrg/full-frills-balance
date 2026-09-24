import type { CreateJournalData } from '@/src/types/journalWrite';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import type Journal from '@/src/data/models/Journal';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import type { PreparedJournalData } from '@/src/services/journal/prepareJournalData';

/**
 * Transitional API retained for fixtures and older tests.
 * All writes delegate to the validated journal persistence boundary.
 */
export class LedgerCreateService {
  createJournal(data: CreateJournalData, workplaceId: WorkplaceId): Promise<Journal> {
    return journalPersistenceService.put(data, workplaceId);
  }

  createMany(
    items: { data: CreateJournalData; prepared: PreparedJournalData }[],
    workplaceId: WorkplaceId,
  ): Promise<Journal[]> {
    return journalPersistenceService.putMany(
      items.map(item => item.data),
      workplaceId,
    );
  }

  createReversalJournal(
    originalJournalId: JournalId,
    reason: string,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    return journalPersistenceService.reverse(originalJournalId, reason, workplaceId);
  }
}

export const ledgerCreateService = new LedgerCreateService();
