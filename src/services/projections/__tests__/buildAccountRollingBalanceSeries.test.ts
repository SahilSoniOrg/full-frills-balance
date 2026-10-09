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

  it('stops plotting at dataEnd while ticks still span the whole window', () => {
    const start = new Date(2024, 0, 1).getTime();
    const end = new Date(2024, 0, 31, 23, 59).getTime();
    const today = new Date(2024, 0, 10, 12).getTime();

    const result = buildAccountRollingBalanceSeries({
      transactions: [{ transactionDate: new Date(2024, 0, 2, 9).getTime(), runningBalance: 50 }],
      visibleStart: start,
      visibleEnd: end,
      paddingDays: 0,
      dataEnd: today,
      msPerDay: MS_PER_DAY,
      tickCount: 2,
    });

    expect(Math.max(...result.chartData.map(point => point.x))).toBe(
      new Date(2024, 0, 10).getTime(),
    );
    expect(result.xTicks.at(-1)).toBe(end);
  });

  it('seeds sparse category history at the period opening and preserves its full change', () => {
    const start = new Date(2024, 8, 1).getTime();
    const end = new Date(2024, 8, 30, 23, 59, 59, 999).getTime();
    const result = buildAccountRollingBalanceSeries({
      transactions: [
        { transactionDate: new Date(2024, 7, 10).getTime(), runningBalance: 100 },
        { transactionDate: new Date(2024, 8, 5).getTime(), runningBalance: 130 },
        { transactionDate: new Date(2024, 8, 12).getTime(), runningBalance: 175 },
      ],
      visibleStart: start,
      visibleEnd: end,
      openingBalance: 100,
      msPerDay: MS_PER_DAY,
      paddingDays: 0,
    });

    expect(result.chartData).toHaveLength(30);
    expect(result.chartData[0]).toEqual({ x: start, y: 0 });
    expect(result.chartData[4].y).toBe(30);
    expect(result.chartData.at(-1)?.y).toBe(75);
    expect(result.rollingAverageData).toEqual([]);
  });

  it('includes opening-day entries and forward-fills unresolved running balances', () => {
    const start = new Date(2024, 8, 1).getTime();
    const result = buildAccountRollingBalanceSeries({
      transactions: [
        { transactionDate: new Date(2024, 8, 1, 9).getTime(), runningBalance: 130 },
        { transactionDate: new Date(2024, 8, 2, 9).getTime(), runningBalance: null },
        { transactionDate: new Date(2024, 8, 3, 9).getTime(), runningBalance: 175 },
      ],
      visibleStart: start,
      visibleEnd: new Date(2024, 8, 3, 23, 59, 59, 999).getTime(),
      openingBalance: 100,
      msPerDay: MS_PER_DAY,
      paddingDays: 0,
    });

    expect(result.chartData.map(point => point.y)).toEqual([30, 30, 75]);
  });

  it('keeps an empty seeded period at zero and stops at today', () => {
    const start = new Date(2024, 8, 1).getTime();
    const end = new Date(2024, 8, 30, 23, 59, 59, 999).getTime();
    const result = buildAccountRollingBalanceSeries({
      transactions: [],
      visibleStart: start,
      visibleEnd: end,
      openingBalance: 0,
      dataEnd: new Date(2024, 8, 3, 12).getTime(),
      msPerDay: MS_PER_DAY,
      paddingDays: 0,
    });

    expect(result.chartData).toEqual([
      { x: start, y: 0 },
      { x: start + MS_PER_DAY, y: 0 },
      { x: start + 2 * MS_PER_DAY, y: 0 },
    ]);
    expect(result.xTicks.at(-1)).toBe(end);
  });
});
