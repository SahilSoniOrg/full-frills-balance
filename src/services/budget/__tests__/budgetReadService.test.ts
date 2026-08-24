import { database } from '@/src/data/database/Database';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import { accountWriteRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import dayjs from 'dayjs';

describe('budgetReadService', () => {
  let expenseParentId: string;
  let expenseChildId: string;
  let assetId: string;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    const asset = await accountWriteRepository.create({
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    assetId = asset.id;

    const parent = await accountWriteRepository.create({
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    expenseParentId = parent.id;

    const child = await accountWriteRepository.create({
      name: 'Groceries',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      parentAccountId: parent.id,
      workplaceId: 'wp-1' as WorkplaceId,
    });
    expenseChildId = child.id;
  });

  it('should compute budget usage recursively and apply refunds correctly', async () => {
    const month = '2023-10';
    const middleOfMonth = dayjs('2023-10-15').valueOf();

    const budget = await budgetRepository.create(
      'wp-1' as WorkplaceId,
      {
        name: 'Food Budget',
        amount: 500, // $500
        currencyCode: 'USD',
        startMonth: month,
      },
      [expenseParentId as AccountId],
    );

    // 1. Add an expense to the child account. It should roll up.
    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Grocery Trip',
        journalDate: middleOfMonth,
        currencyCode: 'USD',
        transactions: [
          {
            accountId: expenseChildId as AccountId,
            amount: 150,
            transactionType: TransactionType.DEBIT,
          },
          { accountId: assetId as AccountId, amount: 150, transactionType: TransactionType.CREDIT },
        ],
      },
      'wp-1' as WorkplaceId,
    );

    // 2. Refund on child account
    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Grocery Refund',
        journalDate: middleOfMonth,
        currencyCode: 'USD',
        transactions: [
          {
            accountId: expenseChildId as AccountId,
            amount: 50,
            transactionType: TransactionType.CREDIT,
          }, // refund
          { accountId: assetId as AccountId, amount: 50, transactionType: TransactionType.DEBIT },
        ],
      },
      'wp-1' as WorkplaceId,
    );

    // 3. Out of bounds expense
    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Old Grocery',
        journalDate: dayjs('2023-09-15').valueOf(),
        currencyCode: 'USD',
        transactions: [
          {
            accountId: expenseChildId as AccountId,
            amount: 100,
            transactionType: TransactionType.DEBIT,
          },
          { accountId: assetId as AccountId, amount: 100, transactionType: TransactionType.CREDIT },
        ],
      },
      'wp-1' as WorkplaceId,
    );

    // Wait briefly for DB indexing if needed
    await new Promise(r => setTimeout(r, 50));

    let lastUsage: any;
    const sub = budgetReadService
      .observeBudgetUsage('wp-1' as WorkplaceId, budget.id, month)
      .subscribe(u => {
        // We want the most recent emission.
        // It will emit several times initially as observables resolve.
        if (u && u.budgetAmount === 500) {
          lastUsage = u;
        }
      });

    await new Promise(r => setTimeout(r, 200)); // give RxJS some ticks to evaluate
    sub.unsubscribe();

    expect(lastUsage).toBeDefined();
    // Net spent mapped to period: 150 - 50 = 100
    expect(lastUsage.spent).toBe(100);
    expect(lastUsage.remaining).toBe(400);
    expect(lastUsage.usagePercent).toBe(0.2);
  });

  it('should allow querying an older month natively', async () => {
    const currentMonth = '2023-10';
    const previousMonth = '2023-09';

    const budget = await budgetRepository.create(
      'wp-1' as WorkplaceId,
      {
        name: 'Food Budget',
        amount: 500,
        currencyCode: 'USD',
        startMonth: currentMonth,
      },
      [expenseParentId as AccountId],
    );

    // Add expense in the previous month
    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Old Grocery',
        journalDate: dayjs('2023-09-15').valueOf(),
        currencyCode: 'USD',
        transactions: [
          {
            accountId: expenseChildId as AccountId,
            amount: 200,
            transactionType: TransactionType.DEBIT,
          },
          { accountId: assetId as AccountId, amount: 200, transactionType: TransactionType.CREDIT },
        ],
      },
      'wp-1' as WorkplaceId,
    );

    // Wait briefly for DB indexing
    await new Promise(r => setTimeout(r, 50));

    let lastUsage: any;
    const sub = budgetReadService
      .observeBudgetUsage('wp-1' as WorkplaceId, budget.id, previousMonth)
      .subscribe(u => {
        if (u && u.budgetAmount === 500) {
          lastUsage = u;
        }
      });

    await new Promise(r => setTimeout(r, 200));
    sub.unsubscribe();

    expect(lastUsage).toBeDefined();
    expect(lastUsage.spent).toBe(200);
    expect(lastUsage.remaining).toBe(300);
  });

  it('returns empty usage when budget belongs to another workplace', async () => {
    const foreignBudget = await budgetRepository.create(
      'wp-2' as WorkplaceId,
      {
        name: 'Foreign Budget',
        amount: 800,
        currencyCode: 'USD',
        startMonth: '2023-10',
      },
      [],
    );

    let emitted: any;
    const sub = budgetReadService
      .observeBudgetUsage('wp-1' as WorkplaceId, foreignBudget.id, '2023-10')
      .subscribe(u => {
        emitted = u;
      });

    await new Promise(r => setTimeout(r, 100));
    sub.unsubscribe();

    expect(emitted).toEqual({
      spent: 0,
      remaining: 0,
      budgetAmount: 0,
      usagePercent: 0,
    });
  });

  it('ignores transactions and journals from a different workplace', async () => {
    const month = '2023-10';
    const middleOfMonth = dayjs('2023-10-15').valueOf();

    const budget = await budgetRepository.create(
      'wp-1' as WorkplaceId,
      {
        name: 'Food Budget',
        amount: 500,
        currencyCode: 'USD',
        startMonth: month,
      },
      [expenseChildId as AccountId],
    );

    // Create transaction in wp-2
    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Foreign Grocery Trip',
        journalDate: middleOfMonth,
        currencyCode: 'USD',
        transactions: [
          {
            accountId: expenseChildId as AccountId,
            amount: 300,
            transactionType: TransactionType.DEBIT,
          },
          { accountId: assetId as AccountId, amount: 300, transactionType: TransactionType.CREDIT },
        ],
      },
      'wp-2' as WorkplaceId,
    );

    await new Promise(r => setTimeout(r, 50));

    let lastUsage: any;
    const sub = budgetReadService
      .observeBudgetUsage('wp-1' as WorkplaceId, budget.id, month)
      .subscribe(u => {
        if (u && u.budgetAmount === 500) {
          lastUsage = u;
        }
      });

    await new Promise(r => setTimeout(r, 200));
    sub.unsubscribe();

    expect(lastUsage).toBeDefined();
    // wp-2 transaction should be ignored
    expect(lastUsage.spent).toBe(0);
    expect(lastUsage.remaining).toBe(500);
  });
});
