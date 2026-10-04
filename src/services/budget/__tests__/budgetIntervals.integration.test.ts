import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { readBudgets } from '@/src/services/reports-v2/reportInputReader';
import { calculateBudgetPerformance } from '@/src/services/reports-v2/calculators/planning/budgetPerformanceCalculator';
import { AccountType } from '@/src/types/enums';
import { asWorkplaceId } from '@/src/types/ids';
import { BudgetPeriodUtils } from '../BudgetPeriodUtils';
import { budgetWriteService } from '../budgetWriteService';

const workplaceId = asWorkplaceId('budget-intervals');
const creationDate = new Date(2026, 9, 7).getTime();
const period = {
  startDate: new Date(2026, 9, 10).getTime(),
  endDate: new Date(2026, 9, 18, 23, 59, 59).getTime(),
  timeZone: 'Asia/Kolkata',
};

describe('budget intervals across storage and reports', () => {
  beforeEach(async () => {
    await database.write(() => database.unsafeResetDatabase());
  });

  it.each([
    { intervalType: 'WEEKLY', intervalN: 2, recurrenceDay: 1 },
    { intervalType: 'MONTHLY', intervalN: 3, recurrenceDay: undefined },
  ])('uses the same creation anchor for $intervalN $intervalType cycles', async rule => {
    const account = await accountWriteRepository.create({
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId,
    });
    const budget = await budgetWriteService.createBudget(
      workplaceId,
      {
        name: 'Food',
        amount: 700,
        currencyCode: 'USD',
        startMonth: '2026-10',
        ...rule,
      },
      [account.id],
    );
    await database.write(() =>
      budget.update(b => {
        b.createdAt = new Date(creationDate);
      }),
    );
    const reports = await readBudgets(workplaceId, 'USD', period);
    expect(reports.budgets).toHaveLength(1);
    expect(BudgetPeriodUtils.getCurrentPeriod(reports.budgets[0], period.startDate)).toEqual(
      BudgetPeriodUtils.getCurrentPeriod(budget, period.startDate),
    );
    const result = calculateBudgetPerformance({
      budgets: reports.budgets,
      actualFacts: [],
      plannedFacts: [],
      period,
    });
    expect(result.budgets[0].budgetedAmount).toBe(700);
    expect((await budgetRepository.find(workplaceId, budget.id))?.intervalN).toBe(rule.intervalN);
  });

  it('preserves historical report allocations for existing one-month budgets', async () => {
    const account = await accountWriteRepository.create({
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId,
    });
    await budgetWriteService.createBudget(
      workplaceId,
      {
        name: 'Food',
        amount: 700,
        currencyCode: 'USD',
        startMonth: '2026-01',
        intervalType: 'MONTHLY',
        intervalN: 1,
        recurrenceDay: 1,
      },
      [account.id],
    );
    const historicalPeriod = {
      startDate: new Date(2026, 0, 1).getTime(),
      endDate: new Date(2026, 2, 31, 23, 59, 59).getTime(),
      timeZone: 'Asia/Kolkata',
    };
    const reports = await readBudgets(workplaceId, 'USD', historicalPeriod);
    const result = calculateBudgetPerformance({
      budgets: reports.budgets,
      actualFacts: [],
      plannedFacts: [],
      period: historicalPeriod,
    });
    expect(result.budgets[0].budgetedAmount).toBe(2100);
  });

  it.each([0, -1, 1.5, Number.NaN, 10000])(
    'rejects invalid counts at the write boundary: %s',
    async count => {
      await expect(
        budgetWriteService.createBudget(
          workplaceId,
          {
            name: 'Food',
            amount: 700,
            currencyCode: 'USD',
            startMonth: '2026-10',
            intervalN: count,
          },
          [],
        ),
      ).rejects.toThrow('Enter a whole number');
      expect(await database.collections.get('budgets').query().fetchCount()).toBe(0);
    },
  );
});
