import { periodRangeForPreset } from './helpers';

describe('Reports V2 period presets', () => {
  const now = new Date('2026-09-12T15:30:00.000Z');
  const todayEndDate = new Date(now);
  todayEndDate.setHours(23, 59, 59, 999);
  const todayEnd = todayEndDate.getTime();

  it('uses month-to-date for the current month', () => {
    expect(periodRangeForPreset('month', now)).toEqual({
      startDate: new Date(2026, 8, 1).getTime(),
      endDate: todayEnd,
    });
  });

  it('uses quarter-to-date and year-to-date instead of future dates', () => {
    expect(periodRangeForPreset('quarter', now)).toEqual({
      startDate: new Date(2026, 6, 1).getTime(),
      endDate: todayEnd,
    });
    expect(periodRangeForPreset('year', now)).toEqual({
      startDate: new Date(2026, 0, 1).getTime(),
      endDate: todayEnd,
    });
  });
});
