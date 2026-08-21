import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';
import { JournalId, WorkplaceId } from '@/src/types/domain';
import { enqueueRebuildIfNeeded } from './bulkHelpers';

/**
 * Atomically soft deletes multiple journals and their child transactions in a single batch.
 */
export async function bulkDeleteJournals(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
): Promise<void> {
  if (journalIds.length === 0) return;

  const { affectedAccountIds, minDate } = await journalWriteRepository.bulkSoftDeleteJournals(
    workplaceId,
    journalIds,
  );

  enqueueRebuildIfNeeded(affectedAccountIds, minDate, workplaceId);
}
