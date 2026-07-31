import { buildAccountRollingBalanceSeries } from '../buildAccountRollingBalanceSeries';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('buildAccountRollingBalanceSeries', () => {
  it('returns empty series when there are no transactions', () => {
    expect(
      buildAccountRollingBalanceSeries({
        transactions: [],
        msPerDay: MS_PER_DAY,
      }),
    ).toEqual({ chartData: [], rollingAverageData: [], xTicks: [] });
  });

  it('forward-fills missing runningBalance from prior known balance', () => {
    const day0 = Date.UTC(2024, 0, 1, 12);
    const day1 = Date.UTC(2024, 0, 2, 12);

    const result = buildAccountRollingBalanceSeries({
      transactions: [
        { transactionDate: day0, runningBalance: 100 },
        { transactionDate: day1, runningBalance: null },
      ],
      visibleStart: Date.UTC(2024, 0, 1),
      visibleEnd: Date.UTC(2024, 0, 2),
      msPerDay: MS_PER_DAY,
      paddingDays: 0,
      rollingWindowDays: 1,
      tickCount: 2,
    });

    expect(result.chartData.length).toBeGreaterThan(0);
    // Day-2 daily close should still be 100 (forward-filled)
    const day2Start = new Date(day1).setHours(0, 0, 0, 0);
    const day2Point = result.chartData.find(p => p.x === day2Start);
    expect(day2Point?.y).toBe(100);
  });

  it('computes trailing rolling average over the window', () => {
    const day0 = Date.UTC(2024, 0, 1, 15);
    const day1 = Date.UTC(2024, 0, 2, 15);
    const day2 = Date.UTC(2024, 0, 3, 15);

    const result = buildAccountRollingBalanceSeries({
      transactions: [
        { transactionDate: day0, runningBalance: 10 },
        { transactionDate: day1, runningBalance: 20 },
        { transactionDate: day2, runningBalance: 30 },
      ],
      visibleStart: new Date(day0).setHours(0, 0, 0, 0),
      visibleEnd: new Date(day2).setHours(0, 0, 0, 0),
      msPerDay: MS_PER_DAY,
      paddingDays: 0,
      rollingWindowDays: 2,
      tickCount: 2,
    });

    const day0Start = new Date(day0).setHours(0, 0, 0, 0);
    const day1Start = new Date(day1).setHours(0, 0, 0, 0);
    const day2Start = new Date(day2).setHours(0, 0, 0, 0);

    const r0 = result.rollingAverageData.find(p => p.x === day0Start);
    const r1 = result.rollingAverageData.find(p => p.x === day1Start);
    const r2 = result.rollingAverageData.find(p => p.x === day2Start);

    expect(r0?.y).toBe(10);
    expect(r1?.y).toBe(15); // (10+20)/2
    expect(r2?.y).toBe(25); // (20+30)/2
  });

  it('emits the requested number of x ticks spanning the padded window', () => {
    const day0 = Date.UTC(2024, 0, 1, 12);
    const result = buildAccountRollingBalanceSeries({
      transactions: [{ transactionDate: day0, runningBalance: 50 }],
      visibleStart: Date.UTC(2024, 0, 1),
      visibleEnd: Date.UTC(2024, 0, 1),
      msPerDay: MS_PER_DAY,
      paddingDays: 7,
      tickCount: 4,
    });

    expect(result.xTicks).toHaveLength(4);
    expect(result.xTicks[0]).toBe(Date.UTC(2024, 0, 1));
    expect(result.xTicks[3]).toBe(Date.UTC(2024, 0, 1) + 7 * MS_PER_DAY);
  });
});
