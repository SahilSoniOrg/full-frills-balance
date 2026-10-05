import { DetailDisclosure } from '../DetailDisclosure';
import { AppButton, AppText, Icon } from '@/src/components/core';
import { fireEvent, render } from '@/src/utils/test-utils';

describe('detail disclosures', () => {
  it('keeps deeper content hidden until expanded and reports its state to accessibility', () => {
    const onPress = jest.fn();
    const screen = render(
      <DetailDisclosure title="History" icon={Icon.History} summary="25 recorded · 2 skipped">
        <AppText>Payment totals</AppText>
        <AppButton onPress={onPress}>Open last payment</AppButton>
      </DetailDisclosure>,
    );
    expect(screen.getByText('25 recorded · 2 skipped')).toBeTruthy();
    expect(screen.queryByText('Payment totals')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Expand History' }).props.accessibilityState.expanded,
    ).toBe(false);
    fireEvent.press(screen.getByRole('button', { name: 'Expand History' }));
    expect(
      screen.getByRole('button', { name: 'Collapse History' }).props.accessibilityState.expanded,
    ).toBe(true);
    fireEvent.press(screen.getByText('Open last payment'));
    expect(onPress).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Collapse History' }));
    expect(screen.queryByText('Payment totals')).toBeNull();
  });
});
