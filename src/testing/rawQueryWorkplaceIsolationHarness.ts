import { Icon } from '@/src/types/domainIcons';
import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

export async function resetRawQueryIsolationDatabase(): Promise<void> {
  jest.restoreAllMocks();
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

export async function createRawQueryIsolationWorkplaces(
  workplaceOne: WorkplaceId,
  workplaceTwo: WorkplaceId,
  names: { one: string; two: string },
): Promise<void> {
  await workplaceRepository.create({
    id: workplaceOne,
    name: names.one,
    icon: Icon.Home,
    defaultCurrencyCode: 'USD',
  });
  await workplaceRepository.create({
    id: workplaceTwo,
    name: names.two,
    icon: Icon.Briefcase,
    defaultCurrencyCode: 'USD',
  });
}

export async function createIsolationAssetAccounts(
  workplaceOne: WorkplaceId,
  workplaceTwo: WorkplaceId,
): Promise<{ localAccountId: AccountId; foreignAccountId: AccountId }> {
  const localAccount = await accountWriteRepository.create({
    name: 'Local account',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId: workplaceOne,
  });
  const foreignAccount = await accountWriteRepository.create({
    name: 'Foreign account',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId: workplaceTwo,
  });
  return { localAccountId: localAccount.id, foreignAccountId: foreignAccount.id };
}

export async function createMalformedCrossAccountTransaction({
  workplaceId,
  journalId,
  accountId,
  amount,
  transactionDate,
}: {
  workplaceId: WorkplaceId;
  journalId: JournalId;
  accountId: AccountId;
  amount: number;
  transactionDate: number;
}): Promise<void> {
  await database.write(async () => {
    await database.collections.get<Transaction>('transactions').create(transaction => {
      transaction.journalId = journalId;
      transaction.accountId = accountId;
      transaction.amount = amount;
      transaction.transactionType = TransactionType.DEBIT;
      transaction.currencyCode = 'USD';
      transaction.transactionDate = transactionDate;
      transaction.workplaceId = workplaceId;
      transaction.createdAt = new Date();
      transaction.updatedAt = new Date();
    });
  });
}

export async function seedAccountListMetricsWorkplaceIsolation(
  workplaceOne: WorkplaceId,
  workplaceTwo: WorkplaceId,
  day: number,
): Promise<{ localAccountId: AccountId; foreignAccountId: AccountId }> {
  await resetRawQueryIsolationDatabase();
  await createRawQueryIsolationWorkplaces(workplaceOne, workplaceTwo, {
    one: 'Account List Workplace One',
    two: 'Account List Workplace Two',
  });
  const { localAccountId, foreignAccountId } = await createIsolationAssetAccounts(
    workplaceOne,
    workplaceTwo,
  );

  await createJournalFixture(
    {
      description: 'Valid local transaction',
      journalDate: day,
      currencyCode: 'USD',
      calculatedBalances: new Map([[localAccountId, 10]]),
      transactions: [
        { accountId: localAccountId, amount: 10, transactionType: TransactionType.DEBIT },
      ],
    },
    workplaceOne,
  );

  await createJournalFixture(
    {
      description: 'Valid foreign transaction',
      journalDate: day + 1_000,
      currencyCode: 'USD',
      calculatedBalances: new Map([[foreignAccountId, 20]]),
      transactions: [
        { accountId: foreignAccountId, amount: 20, transactionType: TransactionType.DEBIT },
      ],
    },
    workplaceTwo,
  );

  await createJournalFixture(
    {
      description: 'Malformed foreign account link',
      journalDate: day + 2_000,
      currencyCode: 'USD',
      calculatedBalances: new Map([[foreignAccountId, 30]]),
      transactions: [
        { accountId: foreignAccountId, amount: 30, transactionType: TransactionType.DEBIT },
      ],
    },
    workplaceOne,
  );

  const foreignJournal = await createJournalFixture(
    {
      description: 'Malformed foreign journal link',
      journalDate: day + 3_000,
      currencyCode: 'USD',
      calculatedBalances: new Map([[localAccountId, 40]]),
      transactions: [
        { accountId: localAccountId, amount: 40, transactionType: TransactionType.DEBIT },
      ],
    },
    workplaceTwo,
  );

  const localJournal = await createJournalFixture(
    {
      description: 'Malformed foreign transaction link',
      journalDate: day + 4_000,
      currencyCode: 'USD',
      calculatedBalances: new Map([[localAccountId, 50]]),
      transactions: [
        { accountId: localAccountId, amount: 50, transactionType: TransactionType.DEBIT },
      ],
    },
    workplaceOne,
  );

  const [foreignJournalTransaction] = await database.collections
    .get<Transaction>('transactions')
    .query(Q.where('journal_id', foreignJournal.id))
    .fetch();
  const [foreignTransaction] = await database.collections
    .get<Transaction>('transactions')
    .query(Q.where('journal_id', localJournal.id))
    .fetch();
  await database.write(async () => {
    await foreignJournalTransaction.update(transaction => {
      transaction.workplaceId = workplaceOne;
    });
    await foreignTransaction.update(transaction => {
      transaction.workplaceId = workplaceTwo;
    });
  });

  return { localAccountId, foreignAccountId };
}

export async function seedTransactionRawMetricsWorkplaceIsolation(
  workplaceOne: WorkplaceId,
  workplaceTwo: WorkplaceId,
  day: number,
): Promise<{ localAccountId: AccountId; foreignAccountId: AccountId }> {
  await resetRawQueryIsolationDatabase();
  await createRawQueryIsolationWorkplaces(workplaceOne, workplaceTwo, {
    one: 'Metrics Workplace One',
    two: 'Metrics Workplace Two',
  });
  const { localAccountId, foreignAccountId } = await createIsolationAssetAccounts(
    workplaceOne,
    workplaceTwo,
  );

  await createJournalFixture(
    {
      description: 'Valid local transaction',
      journalDate: day,
      currencyCode: 'USD',
      calculatedBalances: new Map([[localAccountId, 10]]),
      transactions: [
        { accountId: localAccountId, amount: 10, transactionType: TransactionType.DEBIT },
      ],
    },
    workplaceOne,
  );

  await createJournalFixture(
    {
      description: 'Foreign account link',
      journalDate: day + 1_000,
      currencyCode: 'USD',
      calculatedBalances: new Map([[foreignAccountId, 20]]),
      transactions: [
        { accountId: foreignAccountId, amount: 20, transactionType: TransactionType.DEBIT },
      ],
    },
    workplaceOne,
  );

  await createJournalFixture(
    {
      description: 'Foreign transaction link',
      journalDate: day + 2_000,
      currencyCode: 'USD',
      calculatedBalances: new Map([[localAccountId, 30]]),
      transactions: [
        { accountId: localAccountId, amount: 30, transactionType: TransactionType.DEBIT },
      ],
    },
    workplaceTwo,
  );

  return { localAccountId, foreignAccountId };
}
