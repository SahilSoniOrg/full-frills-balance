import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { BulkDeleteUndoToken } from '@/src/types/domainJournal';
import { WorkplaceId } from '@/src/types/ids';

export type { BulkDeleteUndoToken } from '@/src/types/domainJournal';

/** Atomically restores the journals and child transactions from a bulk delete. */
export async function bulkRestoreJournals(
  workplaceId: WorkplaceId,
  token: BulkDeleteUndoToken,
): Promise<void> {
  if (token.journals.length === 0 && token.transactions.length === 0) return;

  await journalPersistenceService.bulkRestore(workplaceId, token);
}
