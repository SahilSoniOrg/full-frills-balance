import { buildBudgetCumulativeSeries } from '../buildBudgetCumulativeSeries';
import dayjs from 'dayjs';

describe('buildBudgetCumulativeSeries', () => {
  const periodStart = dayjs('2024-01-01').startOf('day').valueOf();
  const periodEnd = dayjs('2024-01-03').endOf('day').valueOf();

  it('returns zero series with day anchors when there are no transactions', () => {
    const result = buildBudgetCumulativeSeries({
      transactions: [],
      periodStart,
      periodEnd,
      precision: 2,
    });

    expect(result.domainX).toEqual([periodStart, periodEnd]);
    expect(result.data.length).toBe(6);
    expect(result.data.every(point => point.y === 0)).toBe(true);
  });

  it('builds a step series from amounts already converted to budget currency', () => {
    const day1Noon = dayjs('2024-01-01').hour(12).valueOf();
    const day2Noon = dayjs('2024-01-02').hour(12).valueOf();

    const result = buildBudgetCumulativeSeries({
      transactions: [
        { transactionDate: day1Noon, amount: 50, transactionType: 'DEBIT' },
        { transactionDate: day2Noon, amount: 30, transactionType: 'CREDIT' },
      ],
      periodStart,
      periodEnd,
      precision: 2,
    });

    const values = result.data.map(point => point.y);
    expect(values).toContain(50);
    expect(values[values.length - 1]).toBe(20);
  });
});
