import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { brandedKeys, JournalId, WorkplaceId } from '@/src/types/ids';

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

  return runAccountingWriteSession(async session => {
    const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);
    const journalById = new Map(journals.map(journal => [journal.id as JournalId, journal]));
    const inverseRenames: Record<JournalId, string> = {};
    const effectiveRenames = journalIds.flatMap(journalId => {
      const journal = journalById.get(journalId);
      const description = renames[journalId];
      if (!journal || description === undefined || description === (journal.description ?? '')) {
        return [];
      }
      inverseRenames[journalId] = journal.description ?? '';
      return [{ journalId, description }];
    });

    for (const rename of effectiveRenames) {
      await journalPersistenceService.putInSession(session, rename, workplaceId);
    }

    return { renamedCount: effectiveRenames.length, inverseRenames };
  });
}
