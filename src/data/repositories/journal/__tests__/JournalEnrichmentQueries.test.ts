import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import {
  computeDominantTargetAccount,
  journalEnrichmentQueries,
} from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';

describe('computeDominantTargetAccount', () => {
  it('returns target account when there is a single category account (100% consensus)', () => {
    const entries = [
      {
        accountId: 'acc-coffee' as AccountId,
        accountName: 'Coffee & Dining',
        accountType: AccountType.EXPENSE,
        count: 5,
      },
      {
        accountId: 'acc-card' as AccountId,
        accountName: 'Credit Card',
        accountType: AccountType.LIABILITY,
        count: 5,
      },
    ];

    const result = computeDominantTargetAccount(entries, 0.8);
    expect(result).toEqual({
      targetAccountId: 'acc-coffee',
      targetAccountName: 'Coffee & Dining',
      targetAccountType: AccountType.EXPENSE,
      confidence: 1,
    });
  });

  it('returns dominant category when it exceeds the 80% threshold', () => {
    const entries = [
      {
        accountId: 'acc-rides' as AccountId,
        accountName: 'Rideshare',
        accountType: AccountType.EXPENSE,
        count: 8,
      },
      {
        accountId: 'acc-travel' as AccountId,
        accountName: 'Business Travel',
        accountType: AccountType.EXPENSE,
        count: 2,
      },
      {
        accountId: 'acc-card' as AccountId,
        accountName: 'Chase Card',
        accountType: AccountType.LIABILITY,
        count: 10,
      },
    ];

    // 8 / (8 + 2) = 80% -> matches
    const result = computeDominantTargetAccount(entries, 0.8);
    expect(result).toEqual({
      targetAccountId: 'acc-rides',
      targetAccountName: 'Rideshare',
      targetAccountType: AccountType.EXPENSE,
      confidence: 0.8,
    });
  });

  it('returns empty object when multiple categories are split ambiguously (< 80%)', () => {
    const entries = [
      {
        accountId: 'acc-groceries' as AccountId,
        accountName: 'Groceries',
        accountType: AccountType.EXPENSE,
        count: 5,
      },
      {
        accountId: 'acc-personal' as AccountId,
        accountName: 'Personal Care',
        accountType: AccountType.EXPENSE,
        count: 5,
      },
      {
        accountId: 'acc-checking' as AccountId,
        accountName: 'Checking',
        accountType: AccountType.ASSET,
        count: 10,
      },
    ];

    // 5 / 10 = 50% < 80%
    const result = computeDominantTargetAccount(entries, 0.8);
    expect(result).toEqual({});
  });

  it('returns empty object when entries list is empty', () => {
    const result = computeDominantTargetAccount([]);
    expect(result).toEqual({});
  });

  it('works for income categories', () => {
    const entries = [
      {
        accountId: 'acc-salary' as AccountId,
        accountName: 'Main Salary',
        accountType: AccountType.INCOME,
        count: 10,
      },
      {
        accountId: 'acc-bank' as AccountId,
        accountName: 'Bank Checking',
        accountType: AccountType.ASSET,
        count: 10,
      },
    ];

    const result = computeDominantTargetAccount(entries, 0.8);
    expect(result).toEqual({
      targetAccountId: 'acc-salary',
      targetAccountName: 'Main Salary',
      targetAccountType: AccountType.INCOME,
      confidence: 1,
    });
  });
});

describe('JournalEnrichmentQueries workplace isolation', () => {
  const workplaceOne = 'wp-journal-enrichment-one' as WorkplaceId;
  const workplaceTwo = 'wp-journal-enrichment-two' as WorkplaceId;

  let workplaceOneAccountId: AccountId;
  let workplaceTwoAccountId: AccountId;
  let workplaceOneJournalId: JournalId;
  let workplaceTwoJournalId: JournalId;
  const recentJournalDate = () => Date.now();

  beforeEach(async () => {
    jest.restoreAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    await workplaceRepository.create({
      id: workplaceOne,
      name: 'Workplace One',
      icon: 'home',
      defaultCurrencyCode: 'USD',
    });
    await workplaceRepository.create({
      id: workplaceTwo,
      name: 'Workplace Two',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });

    const workplaceOneAccount = await accountWriteRepository.create({
      name: 'Workplace One Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: workplaceOne,
    });
    const workplaceTwoAccount = await accountWriteRepository.create({
      name: 'Foreign Expense',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: workplaceTwo,
    });
    workplaceOneAccountId = workplaceOneAccount.id;
    workplaceTwoAccountId = workplaceTwoAccount.id;

    const workplaceOneJournal = await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Coffee',
        journalDate: recentJournalDate(),
        currencyCode: 'USD',
        transactions: [
          {
            accountId: workplaceOneAccountId,
            amount: 10,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      workplaceOne,
    );
    const workplaceTwoJournal = await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Coffee',
        journalDate: recentJournalDate() - 1_000,
        currencyCode: 'USD',
        transactions: [
          {
            accountId: workplaceTwoAccountId,
            amount: 20,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      workplaceTwo,
    );
    workplaceOneJournalId = workplaceOneJournal.id;
    workplaceTwoJournalId = workplaceTwoJournal.id;

    const transactions = database.collections.get<Transaction>('transactions');
    await database.write(async () => {
      await transactions.create(transaction => {
        transaction.journalId = workplaceOneJournalId;
        transaction.accountId = workplaceTwoAccountId;
        transaction.amount = 30;
        transaction.transactionType = TransactionType.DEBIT;
        transaction.currencyCode = 'USD';
        transaction.transactionDate = 2_000;
        transaction.workplaceId = workplaceTwo;
        transaction.createdAt = new Date();
        transaction.updatedAt = new Date();
      });
      await transactions.create(transaction => {
        transaction.journalId = workplaceOneJournalId;
        transaction.accountId = workplaceTwoAccountId;
        transaction.amount = 40;
        transaction.transactionType = TransactionType.DEBIT;
        transaction.currencyCode = 'USD';
        transaction.transactionDate = 2_000;
        transaction.workplaceId = workplaceOne;
        transaction.createdAt = new Date();
        transaction.updatedAt = new Date();
      });
    });
  });

  it('scopes raw enrichment joins to journals, transactions, and accounts', async () => {
    const queryRaw = jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue([]);

    await journalEnrichmentQueries.getEnrichmentDataRaw(workplaceOne, [
      workplaceOneJournalId,
      workplaceTwoJournalId,
    ]);

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('j.workplace_id = ?');
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('a.workplace_id = ?');
    expect(args.filter(arg => arg === workplaceOne)).toHaveLength(3);
  });

  it('isolates enrichment fallback from mixed journal IDs and malformed links', async () => {
    jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue(null);

    const rows = await journalEnrichmentQueries.getEnrichmentDataRaw(workplaceOne, [
      workplaceOneJournalId,
      workplaceTwoJournalId,
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      journal_id: workplaceOneJournalId,
      account_id: workplaceOneAccountId,
      account_name: 'Workplace One Checking',
      amount: 10,
    });
  });

  it('scopes raw recent-suggestion joins to every workplace-owned table', async () => {
    const queryRaw = jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue([]);

    await journalEnrichmentQueries.getRecentSuggestionsWithTargetAccounts(workplaceOne, 10);

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('j.workplace_id = ?');
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('a.workplace_id = ?');
    expect(args.filter(arg => arg === workplaceOne)).toHaveLength(4);
  });

  it('limits suggestions to the last three months', async () => {
    const queryRaw = jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue([]);

    await journalEnrichmentQueries.getRecentSuggestionsWithTargetAccounts(workplaceOne, 10);

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('journal_date >= ?');
    expect(args).toHaveLength(8);
    expect(typeof args[1]).toBe('number');
    expect(args[1]).toBeLessThan(Date.now());
    expect(args[2]).toBe('%%');
  });

  it('isolates recent-suggestion fallback from malformed transaction and account links', async () => {
    jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue(null);

    const suggestions = await journalEnrichmentQueries.getRecentSuggestionsWithTargetAccounts(
      workplaceOne,
      10,
    );

    expect(suggestions).toEqual([
      {
        description: 'Coffee',
        count: 1,
        confidence: 1,
        targetAccountId: workplaceOneAccountId,
        targetAccountName: 'Workplace One Checking',
        targetAccountType: AccountType.ASSET,
      },
    ]);
  });

  it('pushes the description search into the bounded recent-query contract', async () => {
    const queryRaw = jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue([]);

    await journalEnrichmentQueries.getRecentSuggestionsWithTargetAccounts(
      workplaceOne,
      'coffee',
      3,
    );

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('LOWER(description) LIKE LOWER(?)');
    expect(args[2]).toBe('%coffee%');
    expect(args[3]).toBe(3);
  });

  it('returns every target category used with the same description', async () => {
    const food = await accountWriteRepository.create({
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: workplaceOne,
    });
    const groceries = await accountWriteRepository.create({
      name: 'Groceries',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: workplaceOne,
    });

    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Milk',
        journalDate: recentJournalDate(),
        currencyCode: 'USD',
        transactions: [
          {
            accountId: food.id,
            amount: 10,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      workplaceOne,
    );
    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Milk',
        journalDate: recentJournalDate() - 1_000,
        currencyCode: 'USD',
        transactions: [
          {
            accountId: groceries.id,
            amount: 12,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      workplaceOne,
    );

    const milkSuggestions = (
      await journalEnrichmentQueries.getRecentSuggestionsWithTargetAccounts(workplaceOne, 10)
    ).filter(suggestion => suggestion.description === 'Milk');

    expect(milkSuggestions).toEqual([
      expect.objectContaining({
        description: 'Milk',
        targetAccountId: food.id,
        targetAccountName: 'Food',
        targetAccountType: AccountType.EXPENSE,
      }),
      expect.objectContaining({
        description: 'Milk',
        targetAccountId: groceries.id,
        targetAccountName: 'Groceries',
        targetAccountType: AccountType.EXPENSE,
      }),
    ]);
  });
});
