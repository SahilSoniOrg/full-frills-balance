import { SimpleFormAmountInput } from '../components/SimpleFormAmountInput';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/components/overlays/AmountCalculatorSheet', () => ({
  AmountCalculatorSheet: ({
    visible,
    onDone,
    onDismiss,
  }: {
    visible: boolean;
    onDone: (amount: string) => void;
    onDismiss?: () => void;
  }) => {
    const { Pressable } = jest.requireActual('react-native');
    return visible ? (
      <Pressable
        testID="mock-calculator-done"
        onPress={() => {
          onDone('42');
          onDismiss?.();
        }}
      />
    ) : null;
  },
}));

describe('SimpleFormAmountInput', () => {
  it('starts and completes the guided calculator handoff', () => {
    const setAmount = jest.fn();
    const onCalculatorDone = jest.fn();

    render(
      <SimpleFormAmountInput
        amount=""
        setAmount={setAmount}
        currency="USD"
        accentColor="#3366ff"
        autoOpenCalculator
        onCalculatorDone={onCalculatorDone}
      />,
    );

    fireEvent.press(screen.getByTestId('mock-calculator-done'));
    expect(setAmount).toHaveBeenCalledWith('42');
    expect(onCalculatorDone).toHaveBeenCalledTimes(1);
  });

  it('normalizes comma decimal input without changing its magnitude', () => {
    const setAmount = jest.fn();

    render(
      <SimpleFormAmountInput
        amount=""
        setAmount={setAmount}
        currency="EUR"
        accentColor="#3366ff"
      />,
    );

    fireEvent.changeText(screen.getByTestId('hero-amount-input'), '12,50');

    expect(setAmount).toHaveBeenCalledWith('12.50');
  });
});
