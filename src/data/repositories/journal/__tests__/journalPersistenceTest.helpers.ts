import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import type { PutJournalInput } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { AccountType, JournalDisplayType, JournalStatus, TransactionType } from '@/src/types/enums';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { Q } from '@nozbe/watermelondb';

export const JOURNAL_PERSISTENCE_WORKPLACE = 'wp-journal-persistence' as WorkplaceId;
export const JOURNAL_OWNERSHIP_WORKPLACE_ONE = 'wp-journal-owner-one' as WorkplaceId;
export const JOURNAL_OWNERSHIP_WORKPLACE_TWO = 'wp-journal-owner-two' as WorkplaceId;

export type JournalPersistenceWriteFixtures = {
  debitAccountId: AccountId;
  creditAccountId: AccountId;
  lines: (debit?: number, credit?: number) => PutJournalInput['transactions'];
  putInput: (overrides?: Partial<PutJournalInput>) => PutJournalInput;
};

export async function seedJournalPersistenceWriteFixtures(
  workplaceId: WorkplaceId = JOURNAL_PERSISTENCE_WORKPLACE,
): Promise<JournalPersistenceWriteFixtures> {
  const debitAccount = await accountWriteRepository.create({
    workplaceId,
    name: 'Cash',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  });
  const creditAccount = await accountWriteRepository.create({
    workplaceId,
    name: 'Expense',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  });
  const debitAccountId = debitAccount.id;
  const creditAccountId = creditAccount.id;

  const lines = (debit = 10, credit = 10) => [
    {
      accountId: debitAccountId,
      amount: debit,
      transactionType: TransactionType.DEBIT,
    },
    {
      accountId: creditAccountId,
      amount: credit,
      transactionType: TransactionType.CREDIT,
    },
  ];

  const putInput = (overrides: Partial<PutJournalInput> = {}) => ({
    journalDate: 1_000,
    description: 'Journal',
    currencyCode: 'USD',
    displayType: JournalDisplayType.TRANSFER,
    transactions: lines(),
    ...overrides,
  });

  return { debitAccountId, creditAccountId, lines, putInput };
}

export type WorkplaceJournalOwnershipFixtures = {
  workplaceOneJournal: Journal;
  workplaceTwoJournal: Journal;
  workplaceTwoTransaction: Transaction;
  workplaceOneAccountId: AccountId;
  workplaceOneReplacementAccountId: AccountId;
};

export async function seedWorkplaceJournalOwnershipFixtures(): Promise<WorkplaceJournalOwnershipFixtures> {
  const workplaceOneAccount = await accountWriteRepository.create({
    workplaceId: JOURNAL_OWNERSHIP_WORKPLACE_ONE,
    name: 'Workplace One Account',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  });
  const workplaceOneReplacementAccount = await accountWriteRepository.create({
    workplaceId: JOURNAL_OWNERSHIP_WORKPLACE_ONE,
    name: 'Workplace One Replacement',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  });
  const workplaceTwoAccount = await accountWriteRepository.create({
    workplaceId: JOURNAL_OWNERSHIP_WORKPLACE_TWO,
    name: 'Workplace Two Account',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  });

  const workplaceOneJournal = await createJournalFixture(
    {
      journalDate: 1_000,
      description: 'Workplace One Journal',
      currencyCode: 'USD',
      status: JournalStatus.PLANNED,
      transactions: [
        {
          accountId: workplaceOneAccount.id,
          amount: 10,
          transactionType: TransactionType.DEBIT,
        },
        {
          accountId: workplaceOneReplacementAccount.id,
          amount: 10,
          transactionType: TransactionType.CREDIT,
        },
      ],
    },
    JOURNAL_OWNERSHIP_WORKPLACE_ONE,
  );
  const workplaceTwoJournal = await createJournalFixture(
    {
      journalDate: 2_000,
      description: 'Workplace Two Journal',
      currencyCode: 'USD',
      transactions: [
        {
          accountId: workplaceTwoAccount.id,
          amount: 20,
          transactionType: TransactionType.DEBIT,
        },
      ],
    },
    JOURNAL_OWNERSHIP_WORKPLACE_TWO,
  );

  const [workplaceTwoTransaction] = await transactionQueryRepository.findByJournal(
    JOURNAL_OWNERSHIP_WORKPLACE_TWO,
    workplaceTwoJournal.id,
  );

  return {
    workplaceOneJournal,
    workplaceTwoJournal,
    workplaceTwoTransaction,
    workplaceOneAccountId: workplaceOneAccount.id,
    workplaceOneReplacementAccountId: workplaceOneReplacementAccount.id,
  };
}

export async function activeJournalTransactions(
  workplaceId: WorkplaceId,
  journalId: JournalId,
): Promise<Transaction[]> {
  return database.collections
    .get<Transaction>('transactions')
    .query(
      Q.where('journal_id', journalId),
      Q.where('workplace_id', workplaceId),
      Q.where('deleted_at', Q.eq(null)),
    )
    .fetch();
}
