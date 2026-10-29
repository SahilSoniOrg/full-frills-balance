import { buildLineChartAccessibilitySummary } from '../lineChartAccessibility';

describe('buildLineChartAccessibilitySummary', () => {
  const formatValue = (value: number) => `USD ${value.toFixed(2)}`;
  const formatDate = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
  const oct1 = Date.UTC(2026, 9, 1);
  const oct2 = Date.UTC(2026, 9, 2);
  const oct3 = Date.UTC(2026, 9, 3);

  it('summarizes the start, low point, end, and additional series in date order', () => {
    const summary = buildLineChartAccessibilitySummary({
      chartName: 'Account activity',
      data: [
        { x: oct3, y: 80 },
        { x: oct1, y: 100 },
        { x: oct2, y: 50 },
      ],
      formatValue,
      formatDate,
      additionalSeries: ['7-day average'],
    });

    expect(summary).toBe(
      'Account activity. Starts at USD 100.00 on 2026-10-01, reaches a low of USD 50.00 on 2026-10-02, and ends at USD 80.00 on 2026-10-03. Also shown: 7-day average.',
    );
  });

  it('handles a single point and empty data without inventing values', () => {
    expect(
      buildLineChartAccessibilitySummary({
        chartName: 'Net worth trend',
        data: [{ x: oct1, y: 12 }],
        formatValue,
        formatDate,
      }),
    ).toBe('Net worth trend. USD 12.00 on 2026-10-01.');

    expect(
      buildLineChartAccessibilitySummary({
        chartName: 'Net worth trend',
        data: [],
        formatValue,
        formatDate,
      }),
    ).toBe('Net worth trend. No data available.');
  });
});
