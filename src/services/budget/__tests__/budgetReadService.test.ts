import { TransactionType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { database } from '@/src/data/database/Database';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { resetBudgetReadServiceDatabase } from './budgetReadService.harness';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import {
  budgetReadService,
  type BudgetSpendingHistoryEntry,
} from '@/src/services/budget/budgetReadService';
import dayjs from 'dayjs';
import { firstValueFrom } from 'rxjs';
import { filter, timeout } from 'rxjs/operators';

describe('budgetReadService', () => {
  let expenseParentId: string;
  let expenseChildId: string;
  let assetId: string;

  beforeEach(async () => {
    const ids = await resetBudgetReadServiceDatabase();
    assetId = ids.assetId;
    expenseParentId = ids.expenseParentId;
    expenseChildId = ids.expenseChildId;
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
    await createJournalFixture(
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
    await createJournalFixture(
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
    await createJournalFixture(
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
      .observeBudgetUsage('wp-1' as WorkplaceId, budget.id, middleOfMonth)
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
    const previousMonthRef = dayjs('2023-09-15').valueOf();

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
    await createJournalFixture(
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
      .observeBudgetUsage('wp-1' as WorkplaceId, budget.id, previousMonthRef)
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

  it('uses the journal date when legacy transaction dates belong to another period', async () => {
    const workplaceId = 'wp-1' as WorkplaceId;
    const budget = await budgetRepository.create(
      workplaceId,
      { name: 'Food', amount: 500, currencyCode: 'USD', startMonth: '2023-10' },
      [expenseChildId as AccountId],
    );
    const entry = await createJournalFixture(
      {
        journalDate: dayjs('2023-09-15').valueOf(),
        currencyCode: 'USD',
        transactions: [
          {
            accountId: expenseChildId as AccountId,
            amount: 42.25,
            transactionType: TransactionType.DEBIT,
          },
          {
            accountId: assetId as AccountId,
            amount: 42.25,
            transactionType: TransactionType.CREDIT,
          },
        ],
      },
      workplaceId,
    );
    await database.write(async () => {
      await entry.update(record => {
        record.journalDate = dayjs('2023-10-15').valueOf();
      });
    });
    const usage = await firstValueFrom(
      budgetReadService
        .observeBudgetUsage(workplaceId, budget.id, dayjs('2023-10-15').valueOf())
        .pipe(
          filter(value => value.spent === 42.25),
          timeout({ first: 2000 }),
        ),
    );
    expect(usage.remaining).toBe(457.75);
    const prior = await firstValueFrom(
      budgetReadService
        .observeBudgetUsage(workplaceId, budget.id, dayjs('2023-09-15').valueOf())
        .pipe(timeout({ first: 2000 })),
    );
    expect(prior.spent).toBe(0);
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
      .observeBudgetUsage('wp-1' as WorkplaceId, foreignBudget.id, dayjs('2023-10-15').valueOf())
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
    await createJournalFixture(
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
      .observeBudgetUsage('wp-1' as WorkplaceId, budget.id, middleOfMonth)
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

  it('observes seven category-scoped periods, expands leaf categories, and updates with transactions', async () => {
    const workplaceId = 'wp-1' as WorkplaceId;
    const referenceDate = dayjs('2023-10-15').valueOf();
    const readHistory = () =>
      budgetReadService.observeSpendingHistory(
        workplaceId,
        [expenseParentId as AccountId],
        {
          intervalType: 'MONTHLY',
          intervalN: 1,
          startDate: dayjs('2023-01-01').valueOf(),
          recurrenceDay: 1,
        },
        'USD',
        referenceDate,
      );

    let initial: BudgetSpendingHistoryEntry[] | undefined;
    const sub = readHistory().subscribe(value => {
      if (value.length === 7) initial = value;
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(initial).toHaveLength(7);
    expect(initial?.[6]).toMatchObject({ spent: 0, transactionCount: 0 });

    const updatedPromise = firstValueFrom(
      readHistory().pipe(
        filter(value => value.length === 7 && value[6].spent === 25),
        timeout({ first: 2000 }),
      ),
    );
    await createJournalFixture(
      {
        journalDate: referenceDate,
        currencyCode: 'USD',
        transactions: [
          {
            accountId: expenseChildId as AccountId,
            amount: 25,
            transactionType: TransactionType.DEBIT,
          },
          { accountId: assetId as AccountId, amount: 25, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );

    const updated = await updatedPromise;
    sub.unsubscribe();
    expect(updated[6]).toMatchObject({ spent: 25, transactionCount: 1 });
    expect(
      updated.slice(0, 6).every(period => period.spent === 0 && period.transactionCount === 0),
    ).toBe(true);

    const changedCategory = await firstValueFrom(
      budgetReadService
        .observeSpendingHistory(
          workplaceId,
          [assetId as AccountId],
          {
            intervalType: 'MONTHLY',
            intervalN: 1,
            startDate: dayjs('2023-01-01').valueOf(),
            recurrenceDay: 1,
          },
          'USD',
          referenceDate,
        )
        .pipe(timeout({ first: 2000 })),
    );
    expect(changedCategory).toHaveLength(7);
    expect(changedCategory[6]).toMatchObject({ spent: 0, transactionCount: 0 });
  });

  it('returns no history for an invalid repeat count without querying recurrence ranges', async () => {
    const history = await firstValueFrom(
      budgetReadService.observeSpendingHistory(
        'wp-1' as WorkplaceId,
        [expenseParentId as AccountId],
        { intervalType: 'MONTHLY', intervalN: 0 },
        'USD',
      ),
    );
    expect(history).toEqual([]);
  });
});
