import { AppConfig } from '@/src/constants/app-config';
import { rangeEndingOnLatestActivity, shouldShiftInitialReportRange } from '../initialReportRange';

describe('initialReportRange', () => {
  it('keeps the initial window when the latest journal is inside it', () => {
    const now = Date.now();
    expect(
      shouldShiftInitialReportRange(
        { startDate: now - 10 * 24 * 60 * 60 * 1000, endDate: now },
        now - 2 * 24 * 60 * 60 * 1000,
      ),
    ).toBe(false);
  });

  it('shifts when the latest journal is older than the opened window', () => {
    const now = Date.now();
    const latest = now - 90 * 24 * 60 * 60 * 1000;
    expect(
      shouldShiftInitialReportRange(
        { startDate: now - 30 * 24 * 60 * 60 * 1000, endDate: now },
        latest,
      ),
    ).toBe(true);

    const range = rangeEndingOnLatestActivity(latest);
    const expectedStart = new Date(latest);
    expectedStart.setDate(expectedStart.getDate() - AppConfig.defaults.reportDays);
    expectedStart.setHours(0, 0, 0, 0);
    const expectedEnd = new Date(latest);
    expectedEnd.setHours(23, 59, 59, 999);
    expect(range).toEqual({
      startDate: expectedStart.getTime(),
      endDate: expectedEnd.getTime(),
    });
  });
});
