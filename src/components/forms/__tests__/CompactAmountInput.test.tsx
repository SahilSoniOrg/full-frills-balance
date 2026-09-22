import { Spacing } from '@/src/constants/design-tokens';
import { render, screen } from '@/src/utils/test-utils';
import { StyleSheet } from 'react-native';
import { CompactAmountInput } from '../CompactAmountInput';

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
});
