import { Spacing } from '@/src/constants/design-tokens';
import { render, screen } from '@/src/utils/test-utils';
import { StyleSheet } from 'react-native';
import { CompactAmountInput } from '../CompactAmountInput';

const mockCalculatorAmountInput = jest.fn((_props: Record<string, unknown>) => null);

jest.mock('../CalculatorAmountInput', () => ({
  CalculatorAmountInput: (props: Record<string, unknown>) => mockCalculatorAmountInput(props),
}));

describe('CompactAmountInput', () => {
  it('keeps its amount label contained like the account card label', () => {
    render(
      <CompactAmountInput
        value=""
        currency="USD"
        currencySymbol="$"
        label="Payment total · USD"
        onChangeText={jest.fn()}
      />,
    );

    const label = screen.getByText('Payment total · USD');
    expect(label.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(label.props.style)).toMatchObject({
      flexShrink: 1,
      paddingHorizontal: Spacing.md,
    });
    expect(screen.getByText('$')).toBeTruthy();
  });

  it('derives precision and symbol from the currency when not provided', () => {
    render(<CompactAmountInput value="" currency="jpy" onChangeText={jest.fn()} />);

    expect(mockCalculatorAmountInput).toHaveBeenLastCalledWith(
      expect.objectContaining({ precision: 0, currencySymbol: '¥', placeholder: '0' }),
    );
    expect(screen.getByText('¥')).toBeTruthy();
  });

  it('prefers an explicit precision over the currency default', () => {
    render(<CompactAmountInput value="" currency="JPY" precision={2} onChangeText={jest.fn()} />);

    expect(mockCalculatorAmountInput).toHaveBeenLastCalledWith(
      expect.objectContaining({ precision: 2 }),
    );
  });
});
