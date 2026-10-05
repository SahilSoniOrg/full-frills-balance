import { Icon } from '@/src/types/domainIcons';
import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { resetDatabase } from '@/src/testing/resetDatabase';

export const TWO_WORKPLACE_LEDGER_ONE = 'wp-raw-isolation-1' as WorkplaceId;
export const TWO_WORKPLACE_LEDGER_TWO = 'wp-raw-isolation-2' as WorkplaceId;

export type TwoWorkplaceLedgerFixture = {
  accountId: AccountId;
  foreignAccountId: AccountId;
  localJournalId: JournalId;
  foreignJournalId: JournalId;
};

export async function createMalformedLedgerTransaction(input: {
  workplaceId: WorkplaceId;
  journalId: JournalId;
  transactionAccountId: AccountId;
  amount: number;
  transactionDate: number;
}): Promise<void> {
  await database.write(async () => {
    await database.collections.get<Transaction>('transactions').create(transaction => {
      transaction.workplaceId = input.workplaceId;
      transaction.journalId = input.journalId;
      transaction.accountId = input.transactionAccountId;
      transaction.amount = input.amount;
      transaction.transactionType = TransactionType.DEBIT;
      transaction.currencyCode = 'USD';
      transaction.transactionDate = input.transactionDate;
      transaction.createdAt = new Date(input.transactionDate);
      transaction.updatedAt = new Date(input.transactionDate);
    });
  });
}

export async function setupTwoWorkplaceLedgerFixture(): Promise<TwoWorkplaceLedgerFixture> {
  await resetDatabase();

  await workplaceRepository.create({
    id: TWO_WORKPLACE_LEDGER_ONE,
    name: 'Workplace One',
    icon: Icon.Home,
    defaultCurrencyCode: 'USD',
  });
  await workplaceRepository.create({
    id: TWO_WORKPLACE_LEDGER_TWO,
    name: 'Workplace Two',
    icon: Icon.Briefcase,
    defaultCurrencyCode: 'USD',
  });

  const account = await accountWriteRepository.create({
    name: 'Shared legacy account reference',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId: TWO_WORKPLACE_LEDGER_ONE,
  });
  const foreignAccount = await accountWriteRepository.create({
    name: 'Foreign account',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId: TWO_WORKPLACE_LEDGER_TWO,
  });

  await createJournalFixture(
    {
      description: 'Workplace one transaction',
      journalDate: 1_000,
      currencyCode: 'USD',
      transactions: [{ accountId: account.id, amount: 10, transactionType: TransactionType.DEBIT }],
    },
    TWO_WORKPLACE_LEDGER_ONE,
  );

  const localJournal = await createJournalFixture(
    {
      description: 'Local malformed-link host',
      journalDate: 2_000,
      currencyCode: 'USD',
      transactions: [],
    },
    TWO_WORKPLACE_LEDGER_ONE,
  );
  const foreignJournal = await createJournalFixture(
    {
      description: 'Foreign malformed-link host',
      journalDate: 3_000,
      currencyCode: 'USD',
      transactions: [],
    },
    TWO_WORKPLACE_LEDGER_TWO,
  );

  await createMalformedLedgerTransaction({
    workplaceId: TWO_WORKPLACE_LEDGER_TWO,
    journalId: localJournal.id,
    transactionAccountId: account.id,
    amount: 100,
    transactionDate: 2_000,
  });
  await createMalformedLedgerTransaction({
    workplaceId: TWO_WORKPLACE_LEDGER_ONE,
    journalId: foreignJournal.id,
    transactionAccountId: account.id,
    amount: 200,
    transactionDate: 3_000,
  });
  await createMalformedLedgerTransaction({
    workplaceId: TWO_WORKPLACE_LEDGER_ONE,
    journalId: localJournal.id,
    transactionAccountId: foreignAccount.id,
    amount: 400,
    transactionDate: 4_000,
  });

  return {
    accountId: account.id,
    foreignAccountId: foreignAccount.id,
    localJournalId: localJournal.id,
    foreignJournalId: foreignJournal.id,
  };
}
