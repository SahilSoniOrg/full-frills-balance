import { getBudgetCurrentPeriod, getBudgetPeriodLabel } from '../BudgetPeriodUtils';
import dayjs from 'dayjs';

describe('BudgetPeriodUtils', () => {
  const budget = {
    intervalType: 'MONTHLY',
    intervalN: 1,
    startDate: dayjs('2023-01-01').valueOf(),
    recurrenceDay: 1,
  };

  it('returns the current period for a monthly budget', () => {
    const ref = dayjs('2023-10-15').valueOf();
    const period = getBudgetCurrentPeriod(budget, ref);
    expect(period.startDate).toBe(dayjs('2023-10-01').startOf('day').valueOf());
    expect(period.endDate).toBe(dayjs('2023-10-31').endOf('day').valueOf());
  });

  it('steps across month boundaries when the reference date moves', () => {
    const refBefore = dayjs('2023-10-31T23:59').valueOf();
    const period1 = getBudgetCurrentPeriod(budget, refBefore);
    expect(dayjs(period1.startDate).format('YYYY-MM')).toBe('2023-10');

    const refAfter = dayjs('2023-11-01T00:01').valueOf();
    const period2 = getBudgetCurrentPeriod(budget, refAfter);
    expect(dayjs(period2.startDate).format('YYYY-MM')).toBe('2023-11');
  });

  it('handles weekly budgets', () => {
    const weekly = {
      intervalType: 'WEEKLY',
      intervalN: 1,
      startDate: dayjs('2023-10-02').valueOf(),
      recurrenceDay: 1,
    };
    const ref = dayjs('2023-10-18').valueOf();
    const period = getBudgetCurrentPeriod(weekly, ref);
    expect(period.endDate - period.startDate).toBeGreaterThan(0);
  });

  it('handles yearly budgets', () => {
    const yearly = {
      intervalType: 'YEARLY',
      intervalN: 1,
      startDate: dayjs('2023-01-01').valueOf(),
      recurrenceMonth: 1,
      recurrenceDay: 1,
    };
    const ref = dayjs('2023-06-15').valueOf();
    const period = getBudgetCurrentPeriod(yearly, ref);
    expect(dayjs(period.startDate).year()).toBe(2023);
  });

  it('formats period labels', () => {
    const today = dayjs('2023-10-15');
    const label = getBudgetPeriodLabel(budget, today.valueOf());
    expect(label.length).toBeGreaterThan(0);
  });

  it('uses createdAt when startDate is missing', () => {
    const createdAt = dayjs('2023-05-01').valueOf();
    const ref = dayjs('2023-10-15').valueOf();
    const period = getBudgetCurrentPeriod(
      { intervalType: 'MONTHLY', intervalN: 1, createdAt },
      ref,
    );
    expect(period.startDate).toBeLessThanOrEqual(ref);
    expect(period.endDate).toBeGreaterThanOrEqual(ref);
  });
});
