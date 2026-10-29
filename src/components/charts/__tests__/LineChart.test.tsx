import { LineChart, type DataPoint } from '../LineChart';
import { ChartInteractionProvider } from '../ChartInteractionProvider';
import { render, screen } from '@/src/utils/test-utils';

describe('LineChart accessibility', () => {
  it.each([
    { chartState: 'empty', data: [] as DataPoint[] },
    {
      chartState: 'populated',
      data: [
        { x: 1, y: 100 },
        { x: 2, y: 80 },
      ],
    },
  ])('exposes a text summary for $chartState data as an accessible chart image', ({ data }) => {
    const summary = 'Cash projection. Starts at USD 100 on Oct 29 and ends at USD 80 on Nov 1.';
    render(
      <ChartInteractionProvider>
        <LineChart data={data} currencyCode="USD" accessibilitySummary={summary} />
      </ChartInteractionProvider>,
    );

    expect(screen.getByRole('image', { name: summary })).toBeTruthy();
  });
});
