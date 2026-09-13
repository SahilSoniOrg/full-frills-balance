import { calculateBudgetPerformance } from '../budgetPerformanceCalculator';

describe('Reports V2 budget recurrence', () => {
  it('allocates one budget amount per active recurrence cycle', () => {
    const result = calculateBudgetPerformance({
      budgets: [
        {
          id: 'quarterly',
          name: 'Quarterly',
          amount: 300,
          intervalType: 'MONTHLY',
          intervalN: 3,
          startDate: new Date(2026, 0, 1).getTime(),
          recurrenceDay: 1,
          leafAccountIds: ['food'],
        },
      ],
      actualFacts: [],
      plannedFacts: [],
      period: {
        startDate: new Date(2026, 0, 1).getTime(),
        endDate: new Date(2026, 8, 30, 23, 59, 59).getTime(),
      },
    });

    expect(result.budgets[0].budgetedAmount).toBe(900);
    expect(result.totals.budgetedAmount).toBe(900);
  });

  it('does not accrue cycles before the budget starts in an all-time report', () => {
    const result = calculateBudgetPerformance({
      budgets: [
        {
          id: 'monthly',
          name: 'Monthly',
          amount: 100,
          intervalType: 'MONTHLY',
          intervalN: 1,
          startDate: new Date(2026, 0, 1).getTime(),
          recurrenceDay: 1,
          leafAccountIds: ['food'],
        },
      ],
      actualFacts: [],
      plannedFacts: [],
      period: {
        startDate: 0,
        endDate: new Date(2026, 2, 31, 23, 59, 59).getTime(),
      },
    });

    expect(result.budgets[0].budgetedAmount).toBe(300);
  });
});
