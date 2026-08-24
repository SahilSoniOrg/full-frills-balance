import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { transactionRawPatternQueries } from '@/src/data/repositories/raw/TransactionRawPatternQueries';
import { transactionRawMetricsQueries } from '@/src/data/repositories/raw/TransactionRawMetricsQueries';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';

describe('TransactionRawPatternQueries workplace isolation', () => {
  const workplaceOne = 'wp-pattern-one' as WorkplaceId;
  const workplaceTwo = 'wp-pattern-two' as WorkplaceId;
  const startDate = 1_000;
  let localAccountId: AccountId;
  let foreignAccountId: AccountId;
  let localJournalId: JournalId;
  let foreignJournalId: JournalId;

  beforeEach(async () => {
    jest.restoreAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    await workplaceRepository.create({
      id: workplaceOne,
      name: 'Pattern Workplace One',
      icon: 'home',
      defaultCurrencyCode: 'USD',
    });
    await workplaceRepository.create({
      id: workplaceTwo,
      name: 'Pattern Workplace Two',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });

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
    localAccountId = localAccount.id;
    foreignAccountId = foreignAccount.id;

    const localJournal = await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Local recurring payment',
        journalDate: startDate,
        currencyCode: 'USD',
        transactions: [
          { accountId: localAccountId, amount: 10, transactionType: TransactionType.DEBIT },
        ],
      },
      workplaceOne,
    );
    const foreignJournal = await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Foreign recurring payment',
        journalDate: startDate,
        currencyCode: 'USD',
        transactions: [
          { accountId: foreignAccountId, amount: 20, transactionType: TransactionType.DEBIT },
        ],
      },
      workplaceTwo,
    );
    localJournalId = localJournal.id;
    foreignJournalId = foreignJournal.id;

    const transactions = database.collections.get<Transaction>('transactions');
    await database.write(async () => {
      await transactions.create(transaction => {
        transaction.journalId = localJournalId;
        transaction.accountId = foreignAccountId;
        transaction.amount = 30;
        transaction.transactionType = TransactionType.DEBIT;
        transaction.currencyCode = 'USD';
        transaction.transactionDate = startDate;
        transaction.workplaceId = workplaceTwo;
        transaction.createdAt = new Date();
        transaction.updatedAt = new Date();
      });
      await transactions.create(transaction => {
        transaction.journalId = foreignJournalId;
        transaction.accountId = localAccountId;
        transaction.amount = 40;
        transaction.transactionType = TransactionType.DEBIT;
        transaction.currencyCode = 'USD';
        transaction.transactionDate = startDate;
        transaction.workplaceId = workplaceOne;
        transaction.createdAt = new Date();
        transaction.updatedAt = new Date();
      });
    });
  });

  it('scopes every workplace-owned SQL table with matching arguments', async () => {
    const queryRaw = jest.spyOn(transactionRawMetricsQueries, 'queryRaw').mockResolvedValue([]);

    await transactionRawPatternQueries.getRecurringPatternsRaw(workplaceOne, startDate, 3);

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('j.workplace_id = ?');
    expect(args).toEqual([startDate, workplaceOne, workplaceOne, ...ACTIVE_JOURNAL_STATUSES, 3]);
    expect(sql.match(/\?/g) ?? []).toHaveLength(args.length);
  });

  it('rejects both malformed cross-workplace join directions in the ORM fallback', async () => {
    jest.spyOn(transactionRawMetricsQueries, 'queryRaw').mockResolvedValue(null);

    const patterns = await transactionRawPatternQueries.getRecurringPatternsRaw(
      workplaceOne,
      startDate,
      1,
    );

    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({
      amount: 10,
      accountId: localAccountId,
      currencyCode: 'USD',
      occurrenceCount: 1,
      journalIds: localJournalId,
    });
  });
});
