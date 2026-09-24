import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction from '@/src/data/models/Transaction';
import { JournalDisplayType, JournalStatus } from '@/src/types/enums';
import type { CreateJournalData } from '@/src/types/journalWrite';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import { referenceNumberFromMetadataJson } from '@/src/utils/sms/SmsReferenceExtractor';
import type { Model } from '@nozbe/watermelondb';
import { Q } from '@nozbe/watermelondb';

/** Extra persisted fields accepted when a test needs to construct legacy or malformed rows. */
export interface RawJournalFixtureData extends CreateJournalData {
  totalAmount?: number;
  displayType?: JournalDisplayType;
  calculatedBalances?: ReadonlyMap<string, number | null>;
}

/**
 * Writes journal rows directly for tests of readers, imports, and integrity checks.
 * This deliberately bypasses production validation so tests can represent legacy or corrupt data.
 */
export async function createJournalFixture(
  data: RawJournalFixtureData,
  workplaceId: WorkplaceId,
): Promise<Journal> {
  const now = new Date();
  const journal = database.collections.get<Journal>('journals').prepareCreate(record => {
    record.journalDate = data.journalDate;
    record.description = data.description;
    record.notes = data.notes;
    record.currencyCode = data.currencyCode;
    record.status = data.status ?? JournalStatus.POSTED;
    record.originalJournalId = data.originalJournalId;
    record.plannedPaymentId = data.plannedPaymentId;
    record.totalAmount = data.totalAmount ?? 0;
    record.transactionCount = data.transactions.length;
    record.displayType = data.displayType ?? JournalDisplayType.TRANSFER;
    record.workplaceId = workplaceId;
    record.createdAt = now;
    record.updatedAt = now;
  });

  const transactions = data.transactions.map(line =>
    database.collections.get<Transaction>('transactions').prepareCreate(record => {
      record.journalId = journal.id;
      record.accountId = line.accountId;
      record.amount = line.amount;
      record.currencyCode = line.currencyCode || data.currencyCode;
      record.transactionType = line.transactionType;
      record.transactionDate = data.journalDate;
      record.notes = line.notes;
      record.exchangeRate = line.exchangeRate;
      record.runningBalance = data.calculatedBalances?.get(line.accountId) ?? null;
      record.workplaceId = workplaceId;
      record.createdAt = now;
      record.updatedAt = now;
    }),
  );

  const operations: Model[] = [journal, ...transactions];
  if (data.metadata) {
    operations.push(
      database.collections.get<JournalMetadata>('journal_metadata').prepareCreate(record => {
        record.journalId = journal.id;
        record.workplaceId = workplaceId;
        record.importSource = data.metadata!.importSource;
        record.originalSmsId = data.metadata!.originalSmsId;
        record.originalSmsSender = data.metadata!.originalSmsSender;
        record.originalSmsBody = data.metadata!.originalSmsBody;
        record.metadataJson = data.metadata!.metadataJson;
        record.referenceNumber = referenceNumberFromMetadataJson(data.metadata!.metadataJson);
        record.createdAt = now;
        record.updatedAt = now;
      }),
    );
  }

  await database.write(async () => {
    await database.batch(operations);
  });
  return journal;
}

/** Soft-deletes a raw fixture and its lines without invoking accounting side effects. */
export async function softDeleteJournalFixture(
  workplaceId: WorkplaceId,
  journalId: JournalId,
): Promise<void> {
  const journal = await database.collections.get<Journal>('journals').find(journalId);
  if (journal.workplaceId !== workplaceId) return;

  const transactions = await database.collections
    .get<Transaction>('transactions')
    .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
    .fetch();
  const deletedAt = new Date();
  const operations: Model[] = [
    journal.prepareUpdate(record => {
      record.deletedAt = deletedAt;
      record.updatedAt = deletedAt;
    }),
    ...transactions.map(transaction =>
      transaction.prepareUpdate(record => {
        record.deletedAt = deletedAt;
        record.updatedAt = deletedAt;
      }),
    ),
  ];

  await database.write(async () => {
    await database.batch(operations);
  });
}
