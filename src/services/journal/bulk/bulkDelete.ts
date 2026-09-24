import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { BulkDeleteUndoToken } from '@/src/types/domainJournal';
import { JournalId, WorkplaceId } from '@/src/types/ids';

/**
 * Atomically soft deletes multiple journals and their child transactions in a single batch.
 */
export async function bulkDeleteJournals(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
): Promise<BulkDeleteUndoToken> {
  if (journalIds.length === 0) {
    return { journals: [], transactions: [] };
  }

  return journalPersistenceService.bulkDelete(workplaceId, journalIds);
}
