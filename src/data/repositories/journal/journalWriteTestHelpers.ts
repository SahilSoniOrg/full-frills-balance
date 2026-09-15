import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { journalWriteRepository as productionJournalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';
import type { PrepareCreateJournalData } from '@/src/data/repositories/journal/journalWriteRepository';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import type { Model } from '@nozbe/watermelondb';

export async function createJournalWithTransactions(
  journalData: PrepareCreateJournalData,
  workplaceId: WorkplaceId,
): Promise<Journal> {
  const { journal, transactions, metadataRecord } =
    productionJournalWriteRepository.prepareCreateJournalWithTransactions(journalData, workplaceId);
  const batchOps: Model[] = [journal, ...transactions];
  if (metadataRecord) batchOps.push(metadataRecord);

  await database.write(async () => {
    await database.batch(batchOps);
  });
  return journal;
}

export async function softDeleteJournal(
  workplaceId: WorkplaceId,
  journalId: JournalId,
): Promise<void> {
  const prepared = await productionJournalWriteRepository.fetchJournalForDeletion(
    journalId,
    workplaceId,
  );
  if (!prepared) return;

  await database.write(async () => {
    await database.batch(
      productionJournalWriteRepository.prepareDeleteJournalUpdates(
        prepared.journal,
        prepared.transactions,
        workplaceId,
        new Date(),
      ),
    );
  });
}

export const journalWriteRepository = {
  createJournalWithTransactions,
  softDeleteJournal,
};
