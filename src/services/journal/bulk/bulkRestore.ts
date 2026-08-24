import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';
import { BulkDeleteUndoToken, WorkplaceId } from '@/src/types/domain';
import { enqueueRebuildIfNeeded } from './bulkHelpers';

export type { BulkDeleteUndoToken } from '@/src/types/domain';

/** Atomically restores the journals and child transactions from a bulk delete. */
export async function bulkRestoreJournals(
  workplaceId: WorkplaceId,
  token: BulkDeleteUndoToken,
): Promise<void> {
  if (token.journals.length === 0 && token.transactions.length === 0) return;

  const { affectedAccountIds, minDate } = await journalWriteRepository.bulkRestoreJournals(
    workplaceId,
    token,
  );

  enqueueRebuildIfNeeded(affectedAccountIds, minDate, workplaceId);
}
