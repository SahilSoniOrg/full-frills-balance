import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction from '@/src/data/models/Transaction';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { AccountType, JournalDisplayType, JournalStatus, TransactionType } from '@/src/types/enums';
import type { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import type { CreateJournalData } from '@/src/types/journalWrite';
import { referenceNumberFromMetadataJson } from '@/src/utils/sms/SmsReferenceExtractor';
import type { Model } from '@nozbe/watermelondb';
import { Q } from '@nozbe/watermelondb';
import { resetDatabase } from '@/src/testing/resetDatabase';

export async function resetJournalIntegrationWorkplace() {
  rebuildQueueService.stop();
  await resetDatabase();
  await workplaceRepository.create({
    id: 'wp-1' as WorkplaceId,
    name: 'Test Workplace',
    icon: 'wallet',
    defaultCurrencyCode: 'USD',
  });

  const cash = await accountWriteRepository.create({
    name: 'Cash',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId: 'wp-1' as WorkplaceId,
  });
  const expense = await accountWriteRepository.create({
    name: 'Food',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
    workplaceId: 'wp-1' as WorkplaceId,
  });
  const income = await accountWriteRepository.create({
    name: 'Salary',
    accountType: AccountType.INCOME,
    currencyCode: 'USD',
    workplaceId: 'wp-1' as WorkplaceId,
  });

  return { cashAccountId: cash.id, expenseAccountId: expense.id, incomeAccountId: income.id };
}

export function balancedUsdExpenseTransactions(
  cashAccountId: AccountId | string,
  expenseAccountId: AccountId | string,
  amount: number,
) {
  return [
    {
      accountId: cashAccountId as AccountId,
      amount,
      transactionType: TransactionType.CREDIT,
    },
    {
      accountId: expenseAccountId as AccountId,
      amount,
      transactionType: TransactionType.DEBIT,
    },
  ];
}

/** Extra persisted fields accepted when a test needs to construct legacy or malformed rows. */
export interface RawJournalFixtureData extends CreateJournalData {
  id?: JournalId;
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
    if (data.id) record._raw.id = data.id;
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

export async function createPlannedJournalsForPayment(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  count: number,
): Promise<Journal[]> {
  const journals: Journal[] = [];
  for (let index = 0; index < count; index++) {
    journals.push(
      await createJournalFixture(
        {
          journalDate: Date.now(),
          currencyCode: 'USD',
          totalAmount: 10,
          plannedPaymentId,
          status: JournalStatus.PLANNED,
          transactions: [],
        },
        workplaceId,
      ),
    );
  }
  return journals;
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
