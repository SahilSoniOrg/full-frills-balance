import { getPreviousEquivalentReportRange } from '@/src/services/reports/reportPeriods';
import { DateRange } from '@/src/utils/dateUtils';

describe('getPreviousEquivalentReportRange', () => {
  const currentRange: DateRange = {
    startDate: new Date(2024, 4, 10, 0, 0, 0, 0).getTime(),
    endDate: new Date(2024, 4, 19, 23, 59, 59, 999).getTime(),
  };

  it('returns the previous calendar month for a month filter', () => {
    const range = getPreviousEquivalentReportRange(
      {
        startDate: new Date(2024, 4, 1).getTime(),
        endDate: new Date(2024, 4, 31, 23, 59, 59, 999).getTime(),
      },
      { type: 'MONTH', month: 4, year: 2024 },
    );

    expect(range).toEqual({
      startDate: new Date(2024, 3, 1).getTime(),
      endDate: new Date(2024, 4, 0, 23, 59, 59, 999).getTime(),
      label: 'Apr 2024',
    });
  });

  it('returns an adjacent period with the same number of days', () => {
    const range = getPreviousEquivalentReportRange(currentRange, {
      type: 'CUSTOM',
      startDate: currentRange.startDate,
      endDate: currentRange.endDate,
    });

    expect(range).toEqual({
      startDate: new Date(2024, 3, 30).getTime(),
      endDate: new Date(2024, 4, 9, 23, 59, 59, 999).getTime(),
      label: 'Previous period',
    });
  });

  it('does not invent a comparison period for all-time', () => {
    expect(getPreviousEquivalentReportRange(currentRange, { type: 'ALL_TIME' })).toBeNull();
  });
});
