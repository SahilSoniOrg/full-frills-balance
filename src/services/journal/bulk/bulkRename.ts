import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';
import { brandedKeys, JournalId, WorkplaceId } from '@/src/types/domain';

export interface BulkRenameResult {
  renamedCount: number;
  inverseRenames: Record<JournalId, string>;
}

/**
 * Bulk updates description/payee name for a set of journals.
 * Returns an inverse rename mapping to support one-tap undo.
 */
export async function bulkRenameJournals(
  workplaceId: WorkplaceId,
  renames: Record<JournalId, string>,
): Promise<BulkRenameResult> {
  const journalIds = brandedKeys(renames);
  if (journalIds.length === 0) {
    return { renamedCount: 0, inverseRenames: {} };
  }

  const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);
  const inverseRenames: Record<JournalId, string> = {};
  const effectiveRenames: Record<JournalId, string> = {};

  for (const journal of journals) {
    const id = journal.id;
    const newName = renames[id];
    if (newName !== undefined && newName !== (journal.description ?? '')) {
      inverseRenames[id] = journal.description ?? '';
      effectiveRenames[id] = newName;
    }
  }

  if (Object.keys(effectiveRenames).length > 0) {
    await journalWriteRepository.bulkUpdateDescriptions(workplaceId, journals, effectiveRenames);
  }

  return {
    renamedCount: Object.keys(effectiveRenames).length,
    inverseRenames,
  };
}
