import { BreakdownDonutCard } from '@/src/features/reports/components/BreakdownDonutCard';
import { AccountId } from '@/src/types/ids';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/components/charts/DonutChart', () => ({
  DonutChart: () => null,
}));

jest.mock('@/src/components/common/MoneyText', () => ({
  MoneyText: () => null,
}));

describe('BreakdownDonutCard', () => {
  const baseProps = {
    donutData: [{ value: 500, color: 'red', label: 'FOOD' }],
    totalCount: 1,
    showExpansionButton: false,
    expanded: false,
    onToggleExpansion: jest.fn(),
    currencyCode: 'EUR',
  };

  it('passes accountIds when a category legend row is pressed', () => {
    const onLegendRowPress = jest.fn();

    render(
      <BreakdownDonutCard
        {...baseProps}
        legendRows={[
          {
            id: 'FOOD',
            accountIds: ['food-1', 'food-2'] as AccountId[],
            color: 'red',
            accountName: 'FOOD',
            percentage: 100,
            amount: 500,
          },
        ]}
        onLegendRowPress={onLegendRowPress}
      />,
    );

    fireEvent.press(screen.getByText('FOOD'));

    expect(onLegendRowPress).toHaveBeenCalledWith(['food-1', 'food-2']);
  });

  it('passes a single account id when an account legend row is pressed', () => {
    const onLegendRowPress = jest.fn();

    render(
      <BreakdownDonutCard
        {...baseProps}
        donutData={[{ value: 250, color: 'red', label: 'Groceries' }]}
        legendRows={[
          {
            id: 'acc-1',
            accountIds: ['acc-1'] as AccountId[],
            color: 'red',
            accountName: 'Groceries',
            percentage: 100,
            amount: 250,
          },
        ]}
        onLegendRowPress={onLegendRowPress}
      />,
    );

    fireEvent.press(screen.getByText('Groceries'));

    expect(onLegendRowPress).toHaveBeenCalledWith(['acc-1']);
  });
});
