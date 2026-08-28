import { SafeToSpendBreakdownMetrics } from '@/src/features/dashboard/components/SafeToSpendBreakdownMetrics';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { StyleSheet } from 'react-native';

const defaultProps = {
  safeToSpend: 33_580,
  committedTotal: 221_554,
  committedLiabilities: 215_716,
  currencyCode: 'INR',
  detailsReady: true,
};

describe('SafeToSpendBreakdownMetrics', () => {
  it('uses equal-width columns when its container has enough room', () => {
    render(<SafeToSpendBreakdownMetrics {...defaultProps} onPress={jest.fn()} />);
    fireEvent(screen.getByTestId('safe-to-spend-breakdown-metrics'), 'layout', {
      nativeEvent: { layout: { width: 900 } },
    });

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(StyleSheet.flatten(buttons[0].props.style)).toEqual(
      expect.objectContaining({ flex: 1, minWidth: 0 }),
    );
  });

  it('keeps compact metrics content-sized', () => {
    render(<SafeToSpendBreakdownMetrics {...defaultProps} onPress={jest.fn()} />);
    fireEvent(screen.getByTestId('safe-to-spend-breakdown-metrics'), 'layout', {
      nativeEvent: { layout: { width: 390 } },
    });

    expect(StyleSheet.flatten(screen.getAllByRole('button')[0].props.style)).toEqual(
      expect.objectContaining({ flexShrink: 1 }),
    );
  });

  it('names each metric button for assistive technology', () => {
    render(<SafeToSpendBreakdownMetrics {...defaultProps} onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Safe to Spend: ₹33,580' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reserved: ₹221,554' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Outstanding: ₹215,716' })).toBeTruthy();
  });

  it('reports the selected metric through its interface', () => {
    const onPress = jest.fn();
    render(<SafeToSpendBreakdownMetrics {...defaultProps} onPress={onPress} />);

    fireEvent.press(screen.getByText('Reserved:'));
    expect(onPress).toHaveBeenCalledWith('committed');
  });
});
