import { firstValueFrom } from 'rxjs';
import { filter, timeout } from 'rxjs/operators';
import dayjs from 'dayjs';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import { TransactionType } from '@/src/types/enums';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { observeBudgetsForAccounts } from '../budgetReadService';
import {
  resetBudgetReadServiceDatabase,
  type BudgetReadServiceHarnessIds,
} from './budgetReadService.harness';

describe('journal budget impact', () => {
  const workplaceId = asWorkplaceId('wp-1');
  const referenceDate = dayjs('2023-09-15').valueOf();
  let ids: BudgetReadServiceHarnessIds;
  beforeEach(async () => {
    ids = await resetBudgetReadServiceDatabase();
  });

  it('matches parent scopes to expense leaves once and uses the journal period', async () => {
    const budget = await budgetRepository.create(
      workplaceId,
      {
        name: 'Food',
        amount: 500,
        currencyCode: 'USD',
        startMonth: '2023-10',
      },
      [asAccountId(ids.expenseParentId), asAccountId(ids.expenseChildId)],
    );
    await createJournalFixture(
      {
        journalDate: referenceDate,
        currencyCode: 'USD',
        transactions: [
          {
            accountId: asAccountId(ids.assetId),
            amount: 42,
            transactionType: TransactionType.CREDIT,
          },
          {
            accountId: asAccountId(ids.expenseChildId),
            amount: 42,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      workplaceId,
    );
    const impact = await firstValueFrom(
      observeBudgetsForAccounts(
        workplaceId,
        [asAccountId(ids.expenseChildId), asAccountId(ids.expenseChildId)],
        referenceDate,
      ).pipe(
        filter(items => items.length === 1 && items[0].usage.spent === 42),
        timeout({ first: 2000 }),
      ),
    );
    expect(impact).toHaveLength(1);
    expect(impact[0]).toMatchObject({
      budgetId: budget.id,
      name: 'Food',
      usage: { remaining: 458 },
    });
    expect(impact[0].periodLabel).toMatch(/Sep|September/);
  });

  it('updates scope membership live, excludes inactive and foreign budgets', async () => {
    const budget = await budgetRepository.create(
      workplaceId,
      { name: 'Food', amount: 500, currencyCode: 'USD', startMonth: '2023-09' },
      [],
    );
    await budgetRepository.create(
      asWorkplaceId('wp-2'),
      { name: 'Foreign', amount: 300, currencyCode: 'USD', startMonth: '2023-09' },
      [asAccountId(ids.expenseChildId)],
    );
    const values: number[] = [];
    const subscription = observeBudgetsForAccounts(
      workplaceId,
      [asAccountId(ids.expenseChildId)],
      referenceDate,
    ).subscribe(items => values.push(items.length));
    const matches = firstValueFrom(
      observeBudgetsForAccounts(workplaceId, [asAccountId(ids.expenseChildId)], referenceDate).pipe(
        filter(items => items.length === 1),
        timeout({ first: 2000 }),
      ),
    );
    await budgetRepository.update(workplaceId, budget, {}, [asAccountId(ids.expenseParentId)]);
    expect((await matches)[0].name).toBe('Food');
    const gone = firstValueFrom(
      observeBudgetsForAccounts(workplaceId, [asAccountId(ids.expenseChildId)], referenceDate).pipe(
        filter(items => items.length === 0),
        timeout({ first: 2000 }),
      ),
    );
    await budgetRepository.update(workplaceId, budget, { active: false }, [
      asAccountId(ids.expenseParentId),
    ]);
    expect(await gone).toEqual([]);
    subscription.unsubscribe();
    expect(values).toContain(1);
  });

  it('returns nothing for balance accounts or an empty scope', async () => {
    await budgetRepository.create(
      workplaceId,
      { name: 'Food', amount: 500, currencyCode: 'USD', startMonth: '2023-09' },
      [asAccountId(ids.expenseParentId)],
    );
    expect(await firstValueFrom(observeBudgetsForAccounts(workplaceId, [], referenceDate))).toEqual(
      [],
    );
    expect(
      await firstValueFrom(
        observeBudgetsForAccounts(workplaceId, [asAccountId(ids.assetId)], referenceDate),
      ),
    ).toEqual([]);
  });
});
