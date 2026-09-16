import { resolveEffectiveReportPeriod, resolveFactReadWindow } from '../reportReadWindow';

describe('Reports V2 read window', () => {
  const period = {
    startDate: Date.UTC(2026, 8, 1),
    endDate: Date.UTC(2026, 8, 16, 23, 59, 59, 999),
    timeZone: 'UTC',
  };

  it('does not change an already bounded period', () => {
    expect(resolveEffectiveReportPeriod(period, Date.UTC(2020, 0, 1))).toEqual(period);
  });

  it('moves all-time start to the first posted journal instead of Unix epoch', () => {
    expect(
      resolveEffectiveReportPeriod(
        { startDate: 0, endDate: period.endDate, timeZone: 'UTC' },
        Date.UTC(2024, 3, 10),
      ),
    ).toEqual({
      startDate: Date.UTC(2024, 3, 10),
      endDate: period.endDate,
      timeZone: 'UTC',
    });
  });

  it('widens the fact window to include the previous period', () => {
    const window = resolveFactReadWindow({ comparison: 'PREVIOUS_PERIOD' }, period);
    expect(window.endDate).toBe(period.endDate);
    expect(window.startDate).toBeLessThan(period.startDate);
  });

  it('keeps the fact window equal to the period when comparison is off', () => {
    expect(resolveFactReadWindow({ comparison: 'NONE' }, period)).toEqual(period);
  });
});
