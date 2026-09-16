import { makeBuckets, MAX_REPORT_BUCKETS } from '../coreUtils';

describe('Reports V2 bucket generation', () => {
  it('keeps short calendar ranges exact', () => {
    const period = {
      startDate: Date.UTC(2026, 0, 1, 18, 30),
      endDate: Date.UTC(2026, 0, 3, 18, 29, 59),
      timeZone: 'Asia/Kolkata',
    };

    expect(makeBuckets(period, 'DAY')).toHaveLength(2);
  });

  it('caps epoch-to-now daily buckets so the income bar chart cannot explode', () => {
    const buckets = makeBuckets(
      { startDate: 0, endDate: Date.UTC(2026, 8, 16), timeZone: 'UTC' },
      'DAY',
    );
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.length).toBeLessThanOrEqual(MAX_REPORT_BUCKETS);
    expect(buckets[0]?.startDate).toBe(0);
    expect(buckets[buckets.length - 1]?.endDate).toBe(Date.UTC(2026, 8, 16));
  });

  it('coarsens an oversized daily series to calendar weeks instead of equal-width months', () => {
    const buckets = makeBuckets(
      {
        startDate: Date.UTC(2026, 0, 1),
        endDate: Date.UTC(2026, 3, 1),
        timeZone: 'UTC',
      },
      'DAY',
    );
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.length).toBeLessThanOrEqual(MAX_REPORT_BUCKETS);
    expect(buckets[0]?.label.startsWith('Week of ')).toBe(true);
  });
});
