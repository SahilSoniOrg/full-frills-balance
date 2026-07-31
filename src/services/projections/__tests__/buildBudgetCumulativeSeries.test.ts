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
      baseCurrency: 'USD',
      rateMap: {},
      precision: 2,
    });

    expect(result.domainX).toEqual([periodStart, periodEnd]);
    // 3 days × (start + end anchors) = 6 points, all y=0
    expect(result.data.length).toBe(6);
    expect(result.data.every(p => p.y === 0)).toBe(true);
  });

  it('builds a step series: debit increases spent, credit decreases', () => {
    const day1Noon = dayjs('2024-01-01').hour(12).valueOf();
    const day2Noon = dayjs('2024-01-02').hour(12).valueOf();

    const result = buildBudgetCumulativeSeries({
      transactions: [
        {
          transactionDate: day1Noon,
          amount: 100,
          currencyCode: 'USD',
          transactionType: 'DEBIT',
        },
        {
          transactionDate: day2Noon,
          amount: 30,
          currencyCode: 'USD',
          transactionType: 'CREDIT',
        },
      ],
      periodStart,
      periodEnd,
      baseCurrency: 'USD',
      rateMap: {},
      precision: 2,
    });

    // After day1 debit: 100; after day2 credit: 70
    const ys = result.data.map(p => p.y);
    expect(ys).toContain(100);
    expect(ys[ys.length - 1]).toBe(70);
  });

  it('converts foreign amounts via rateMap', () => {
    const day1Noon = dayjs('2024-01-01').hour(12).valueOf();

    const result = buildBudgetCumulativeSeries({
      transactions: [
        {
          transactionDate: day1Noon,
          amount: 100,
          currencyCode: 'EUR',
          transactionType: 'DEBIT',
        },
      ],
      periodStart,
      periodEnd,
      baseCurrency: 'USD',
      rateMap: { EUR: 2 },
      precision: 2,
    });

    expect(result.data[result.data.length - 1].y).toBe(50);
  });

  it('ignores foreign amounts when rate is missing', () => {
    const day1Noon = dayjs('2024-01-01').hour(12).valueOf();

    const result = buildBudgetCumulativeSeries({
      transactions: [
        {
          transactionDate: day1Noon,
          amount: 100,
          currencyCode: 'EUR',
          transactionType: 'DEBIT',
        },
      ],
      periodStart,
      periodEnd,
      baseCurrency: 'USD',
      rateMap: {},
      precision: 2,
    });

    expect(result.data.every(p => p.y === 0)).toBe(true);
  });
});
