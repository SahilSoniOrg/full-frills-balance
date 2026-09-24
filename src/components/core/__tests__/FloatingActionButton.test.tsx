import { FloatingActionButton } from '@/src/components/core/FloatingActionButton';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { triggerHaptic } from '@/src/utils/haptics';

jest.mock('@/src/utils/haptics', () => ({
  triggerHaptic: jest.fn(),
}));

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

describe('FloatingActionButton', () => {
  it('triggers a light haptic and calls onPress', () => {
    const onPress = jest.fn();
    render(<FloatingActionButton onPress={onPress} />);

    fireEvent.press(screen.getByTestId('fab-button'));

    expect(triggerHaptic).toHaveBeenCalledWith('light');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('expands action choices and invokes the selected action', () => {
    const onExpand = jest.fn();
    const onExpensePress = jest.fn();

    render(
      <FloatingActionButton
        onExpand={onExpand}
        closeAccessibilityLabel="Close new entry options"
        actions={[
          {
            id: 'expense',
            label: 'Expense',
            onPress: onExpensePress,
            testID: 'fab-expense-action',
          },
        ]}
      />,
    );

    fireEvent.press(screen.getByTestId('fab-button'));
    expect(screen.getByTestId('fab-expense-action')).toBeTruthy();
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Close new entry options')).toBeTruthy();

    fireEvent.press(screen.getByTestId('fab-button'));
    expect(screen.queryByTestId('fab-expense-action')).toBeNull();
    expect(onExpand).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('fab-button'));
    fireEvent.press(screen.getByTestId('fab-dismiss-overlay'));
    expect(screen.queryByTestId('fab-expense-action')).toBeNull();

    fireEvent.press(screen.getByTestId('fab-button'));
    fireEvent.press(screen.getByTestId('fab-expense-action'));
    expect(onExpensePress).toHaveBeenCalledTimes(1);
    expect(onExpand).toHaveBeenCalledTimes(3);
  });
});
