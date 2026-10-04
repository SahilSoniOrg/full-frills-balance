import { presentBudgetPeriod } from '../budgetDetailPresentation';

describe('selected budget period', () => {
  const range = {
    startDate: new Date(2026, 9, 1).getTime(),
    endDate: new Date(2026, 9, 31, 23, 59, 59, 999).getTime(),
  };
  const usage = { spent: 126.55, remaining: 290, budgetAmount: 416.55, usagePercent: 0.3 };

  it('uses calendar days for pace and caps past periods at their full length', () => {
    expect(
      presentBudgetPeriod(range, usage, new Date(2026, 9, 18, 23, 59).getTime()),
    ).toMatchObject({ elapsedShare: 18 / 31, periodDays: 31, daysRemaining: 14 });
    expect(presentBudgetPeriod(range, usage, new Date(2026, 10, 1).getTime()).elapsedShare).toBe(1);
    expect(presentBudgetPeriod(range, usage, new Date(2026, 8, 30).getTime()).elapsedShare).toBe(0);
  });

  it('includes today when allocating the remaining amount', () => {
    const result = presentBudgetPeriod(range, usage, new Date(2026, 9, 3, 23, 59).getTime());
    expect(result.dailyRemaining).toBe(10);
    expect(result.dateRangeText).toBe('1 Oct 2026 – 31 Oct 2026');
  });

  it('keeps the final day available instead of dividing by zero', () => {
    const result = presentBudgetPeriod(range, usage, new Date(2026, 9, 31, 23, 59).getTime());
    expect(result.dailyRemaining).toBe(290);
  });

  it('does not present historical or incomplete balances as daily capacity', () => {
    expect(presentBudgetPeriod(range, usage, new Date(2026, 10, 1).getTime())).toMatchObject({
      dailyRemaining: undefined,
    });
    expect(
      presentBudgetPeriod(
        range,
        { ...usage, hasUnvaluedEntries: true },
        new Date(2026, 9, 3).getTime(),
      ).dailyRemaining,
    ).toBeUndefined();
    expect(
      presentBudgetPeriod(range, { ...usage, remaining: -10 }, new Date(2026, 9, 3).getTime())
        .dailyRemaining,
    ).toBe(0);
  });
});
