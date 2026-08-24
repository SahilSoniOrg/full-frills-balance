import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';
import { BulkDeleteUndoToken } from '@/src/types/domainJournal';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { enqueueRebuildIfNeeded } from './bulkHelpers';

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

  const { affectedAccountIds, minDate, undoToken } =
    await journalWriteRepository.bulkSoftDeleteJournals(workplaceId, journalIds);

  enqueueRebuildIfNeeded(affectedAccountIds, minDate, workplaceId);
  return undoToken;
}
