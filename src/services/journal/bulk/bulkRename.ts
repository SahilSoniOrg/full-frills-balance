import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
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
  if (brandedKeys(renames).length === 0) {
    return { renamedCount: 0, inverseRenames: {} };
  }

  return runAccountingWriteSession(async session => {
    const inverseRenames = await journalPersistenceRepository.renameInSession(
      session,
      workplaceId,
      renames,
    );
    return { renamedCount: brandedKeys(inverseRenames).length, inverseRenames };
  });
}
