import { calculateAverageSpend, formatBudgetAmountLabel } from '../../hooks/budgetEditDraft';

describe('budgetSpendingHistory', () => {
  it('averages completed periods with transactions and ignores empty periods', () => {
    const periods = [
      { label: 'Jan', startDate: 1, endDate: 2, spent: 30 },
      { label: 'Feb', startDate: 3, endDate: 4, spent: 0 },
      { label: 'Mar', startDate: 5, endDate: 6, spent: 10 },
      { label: 'Current', startDate: 7, endDate: 8, spent: 90 },
    ];

    expect(calculateAverageSpend(periods, [2, 0, 1, 3], 'USD')).toBe(20);
    expect(calculateAverageSpend(periods, [0, 0, 0, 5], 'USD')).toBeNull();
    expect(calculateAverageSpend(periods, [1, 0, 0, 0], 'JPY')).toBe(30);
    expect(calculateAverageSpend(periods, [2, 0, 1, 3], 'USD', [false, true, false])).toBeNull();
  });

  it.each([
    ['DAILY', 1, 'Limit each day'],
    ['DAILY', 4, 'Limit every 4 days'],
    ['WEEKLY', 1, 'Limit each week'],
    ['WEEKLY', 3, 'Limit every 3 weeks'],
    ['MONTHLY', 1, 'Limit each month'],
    ['MONTHLY', 2, 'Limit every 2 months'],
    ['YEARLY', 1, 'Limit each year'],
    ['YEARLY', 2, 'Limit every 2 years'],
  ])('formats amount label for %s × %s', (interval, count, expected) => {
    expect(formatBudgetAmountLabel(interval, count)).toBe(expected);
  });
});
