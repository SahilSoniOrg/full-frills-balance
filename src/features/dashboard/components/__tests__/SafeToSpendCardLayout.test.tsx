import { SafeToSpendCardLayout } from '@/src/features/dashboard/components/SafeToSpendCardLayout';
import { fireEvent, render, screen, within } from '@/src/utils/test-utils';
import { Text } from 'react-native';

function renderLayout() {
  return render(
    <SafeToSpendCardLayout
      summary={<Text>Summary</Text>}
      breakdown={<Text>Breakdown</Text>}
      metrics={<Text>Metrics</Text>}
      chart={<Text>Chart</Text>}
    />,
  );
}

describe('SafeToSpendCardLayout', () => {
  it('stacks content when the rendered card is narrow', () => {
    renderLayout();

    fireEvent(screen.getByTestId('safe-to-spend-card-layout'), 'layout', {
      nativeEvent: { layout: { width: 390 } },
    });

    expect(screen.getByTestId('safe-to-spend-card-layout-stacked')).toBeTruthy();
    expect(screen.queryByTestId('safe-to-spend-card-layout-wide')).toBeNull();
  });

  it('uses two columns when the rendered card is wide', () => {
    renderLayout();

    fireEvent(screen.getByTestId('safe-to-spend-card-layout'), 'layout', {
      nativeEvent: { layout: { width: 900 } },
    });

    const wideLayout = screen.getByTestId('safe-to-spend-card-layout-wide');
    expect(wideLayout).toBeTruthy();
    expect(within(wideLayout).getByText('Metrics')).toBeTruthy();
    expect(screen.queryByTestId('safe-to-spend-card-layout-stacked')).toBeNull();
  });
});
