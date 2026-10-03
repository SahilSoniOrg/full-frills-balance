import dayjs from 'dayjs';
import { buildBudgetCumulativeSeries } from '@/src/services/projections/buildBudgetCumulativeSeries';
import { getBudgetPreviousComparisonSpent } from '../budgetPreviousPeriod';

const month = (date: string) => ({
  startDate: dayjs(date).startOf('month').valueOf(),
  endDate: dayjs(date).endOf('month').valueOf(),
});
const series = (
  period: ReturnType<typeof month>,
  postings: { date: string; amount: number; type?: string }[],
) =>
  buildBudgetCumulativeSeries({
    periodStart: period.startDate,
    periodEnd: period.endDate,
    precision: 2,
    transactions: postings.map(({ date, amount, type }) => ({
      transactionDate: dayjs(date).valueOf(),
      amount,
      transactionType: type ?? 'DEBIT',
    })),
  });

describe('previous budget comparison spending', () => {
  it('includes the whole same-offset day, nets refunds, and excludes subsequent days', () => {
    const current = month('2026-03-01');
    const previous = month('2026-02-01');
    const chart = series(previous, [
      { date: '2026-02-01T12:00:00', amount: 100.05 },
      { date: '2026-02-03T23:59:59', amount: 25.03, type: 'CREDIT' },
      { date: '2026-02-04T00:00:00', amount: 500 },
    ]);
    expect(
      getBudgetPreviousComparisonSpent(
        chart,
        current,
        previous,
        dayjs('2026-03-03T08:00:00').valueOf(),
      ),
    ).toBe(75.02);
  });

  it.each(['2024', '2026'])('clamps March 31 to the end of February in %s', year => {
    const current = month(`${year}-03-01`);
    const previous = month(`${year}-02-01`);
    const chart = series(previous, [
      { date: dayjs(previous.endDate).format('YYYY-MM-DDTHH:mm:ss'), amount: 88 },
    ]);
    expect(
      getBudgetPreviousComparisonSpent(
        chart,
        current,
        previous,
        dayjs(`${year}-03-31T12:00:00`).valueOf(),
      ),
    ).toBe(88);
  });

  it('uses the whole previous period when viewing a past period', () => {
    const current = month('2026-02-01');
    const previous = month('2026-01-01');
    const chart = series(previous, [{ date: '2026-01-31T12:00:00', amount: 123 }]);
    expect(
      getBudgetPreviousComparisonSpent(chart, current, previous, dayjs('2026-03-03').valueOf()),
    ).toBe(123);
  });

  it('uses the offset from the cycle start for weekly and non-calendar monthly budgets', () => {
    const current = {
      startDate: dayjs('2026-03-05').valueOf(),
      endDate: dayjs('2026-03-11').endOf('day').valueOf(),
    };
    const previous = {
      startDate: dayjs('2026-02-26').valueOf(),
      endDate: dayjs('2026-03-04').endOf('day').valueOf(),
    };
    const chart = series(previous, [
      { date: '2026-02-28T23:00:00', amount: 20 },
      { date: '2026-03-01T00:00:00', amount: 70 },
    ]);
    expect(
      getBudgetPreviousComparisonSpent(
        chart,
        current,
        previous,
        dayjs('2026-03-07T12:00:00').valueOf(),
      ),
    ).toBe(20);
  });

  it('preserves zero spending and returns null only when comparison context is unavailable', () => {
    const current = month('2026-03-01');
    const previous = month('2026-02-01');
    const chart = series(previous, []);
    const now = dayjs('2026-03-03').valueOf();
    expect(getBudgetPreviousComparisonSpent(chart, current, previous, now)).toBe(0);
    expect(getBudgetPreviousComparisonSpent(null, current, previous, now)).toBeNull();
    expect(getBudgetPreviousComparisonSpent(chart, undefined, previous, now)).toBeNull();
    expect(getBudgetPreviousComparisonSpent(chart, current, undefined, now)).toBeNull();
    expect(
      getBudgetPreviousComparisonSpent(chart, current, previous, dayjs('2026-02-28').valueOf()),
    ).toBeNull();
  });
});
