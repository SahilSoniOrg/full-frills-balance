import { accountWriteRepository } from '@/src/data/repositories/account';
import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { AccountType, TransactionType } from '@/src/types/enums';
import { asWorkplaceId, type AccountId } from '@/src/types/ids';
import dayjs from 'dayjs';
import { firstValueFrom } from 'rxjs';
import {
  observeAccountChartTransactions,
  observeAccountOpeningBalance,
} from '../accountDerivedReads';

const workplaceId = asWorkplaceId('opening-balance');

const spend = (category: AccountId, cash: AccountId, date: string, balance: number) =>
  createJournalFixture(
    {
      description: `Spend on ${date}`,
      journalDate: dayjs(date).valueOf(),
      currencyCode: 'USD',
      transactions: [
        { accountId: category, amount: 10, transactionType: TransactionType.DEBIT },
        { accountId: cash, amount: 10, transactionType: TransactionType.CREDIT },
      ],
      calculatedBalances: new Map([[category, balance]]),
    },
    workplaceId,
  );

beforeEach(async () => {
  await resetDatabase();
}, 15000);

it('reads the running balance of the last entry before the period starts', async () => {
  const create = (name: string, accountType: AccountType) =>
    accountWriteRepository.create({ name, workplaceId, accountType, currencyCode: 'USD' });
  const category = await create('Groceries', AccountType.EXPENSE);
  const cash = await create('Cash', AccountType.ASSET);
  await spend(category.id, cash.id, '2026-08-10', 40);
  await spend(category.id, cash.id, '2026-09-20', 70);
  await spend(category.id, cash.id, '2026-10-02', 90);

  const opening = (date: string) =>
    firstValueFrom(observeAccountOpeningBalance(workplaceId, category.id, dayjs(date).valueOf()));

  expect(await opening('2026-10-01')).toBe(70);
  expect(await opening('2026-09-01')).toBe(40);
  expect(await opening('2026-08-01')).toBe(0);
});

it('uses the ledger ID tie-breaker for both opening balances and chart closing balances', async () => {
  const category = await accountWriteRepository.create({
    name: 'Tied category',
    workplaceId,
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  });
  const date = dayjs('2024-09-30').valueOf();
  const journal = await createJournalFixture(
    {
      description: 'Imported legs with tied timestamps',
      journalDate: date,
      currencyCode: 'USD',
      transactions: [],
    },
    workplaceId,
  );
  await database.write(async () => {
    // Insert in reverse ledger order so insertion order cannot satisfy the assertion.
    const operations = [
      { id: 'zzz', balance: 30 },
      { id: 'aaa', balance: 10 },
    ].map(({ id, balance }) =>
      database.collections.get<Transaction>('transactions').prepareCreate(record => {
        record._raw.id = id;
        record.journalId = journal.id;
        record.accountId = category.id;
        record.amount = id === 'aaa' ? 10 : 20;
        record.currencyCode = 'USD';
        record.transactionType = TransactionType.DEBIT;
        record.transactionDate = date;
        record.runningBalance = balance;
        record.workplaceId = workplaceId;
        record.createdAt = new Date(date);
        record.updatedAt = new Date(date);
      }),
    );
    await database.batch(operations);
  });

  const before = dayjs('2024-10-01').valueOf();
  const latest = await transactionQueryRepository.findLatestForAccount(
    workplaceId,
    category.id,
    before,
    false,
  );
  const opening = await firstValueFrom(
    observeAccountOpeningBalance(workplaceId, category.id, before),
  );
  const chart = await firstValueFrom(
    observeAccountChartTransactions(workplaceId, category.id, date, before),
  );

  expect(latest?.id).toBe('zzz');
  expect(opening).toBe(latest?.runningBalance);
  expect(chart.map(transaction => transaction.id)).toEqual(['aaa', 'zzz']);
});
