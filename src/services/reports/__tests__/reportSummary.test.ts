import { calculateReportSummary } from '@/src/services/reports/reportSummary';
import { AccountId } from '@/src/types/ids';

describe('calculateReportSummary', () => {
  it('calculates net flow, changes, largest category, and highest-spend day', () => {
    const summary = calculateReportSummary({
      incomeVsExpense: { income: 2000, expense: 650 },
      previousIncomeVsExpense: { income: 1800, expense: 500 },
      expenseCategoryBreakdown: [
        {
          category: 'food',
          amount: 400,
          percentage: 61.54,
          accountIds: ['food' as AccountId],
        },
        {
          category: 'transport',
          amount: 250,
          percentage: 38.46,
          accountIds: ['transport' as AccountId],
        },
      ],
      dailyIncomeVsExpense: [
        { date: 1, income: 2000, expense: 100 },
        { date: 2, income: 0, expense: 550 },
      ],
    });

    expect(summary).toEqual({
      income: 2000,
      expense: 650,
      netFlow: 1350,
      comparison: { incomeChange: 200, expenseChange: 150, netFlowChange: 50 },
      largestSpendingCategory: expect.objectContaining({ category: 'food', amount: 400 }),
      highestSpendingDay: { date: 2, amount: 550 },
    });
  });

  it('keeps negative net flow and omits unavailable highlights', () => {
    const summary = calculateReportSummary({
      incomeVsExpense: { income: 100, expense: 250 },
      expenseCategoryBreakdown: [],
      dailyIncomeVsExpense: [{ date: 1, income: 100, expense: -25 }],
    });

    expect(summary.netFlow).toBe(-150);
    expect(summary.comparison).toBeNull();
    expect(summary.largestSpendingCategory).toBeNull();
    expect(summary.highestSpendingDay).toBeNull();
  });

  it('does not treat refunds as a highest-spend day', () => {
    const summary = calculateReportSummary({
      incomeVsExpense: { income: 0, expense: -100 },
      expenseCategoryBreakdown: [],
      dailyIncomeVsExpense: [
        { date: 1, income: 0, expense: -40 },
        { date: 2, income: 0, expense: 0 },
      ],
    });

    expect(summary.highestSpendingDay).toBeNull();
  });
});
