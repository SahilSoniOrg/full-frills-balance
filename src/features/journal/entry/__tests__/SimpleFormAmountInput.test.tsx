import { SimpleFormAmountInput } from '../components/SimpleFormAmountInput';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { useState } from 'react';
import { Keyboard } from 'react-native';

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
  afterEach(() => jest.restoreAllMocks());

  it('normalizes an unfinished decimal on blur without dismissing the next input keyboard', () => {
    const setAmount = jest.fn();
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    render(
      <SimpleFormAmountInput
        amount="12."
        setAmount={setAmount}
        currency="USD"
        accentColor="#3366ff"
      />,
    );
    const input = screen.getByTestId('hero-amount-input');
    fireEvent(input, 'focus');
    fireEvent(input, 'blur');
    expect(setAmount).toHaveBeenCalledWith('12');
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent(input, 'submitEditing');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps typing at the cursor after the first digit instead of selecting the amount', () => {
    function AmountEntry() {
      const [amount, setAmount] = useState('');
      return (
        <SimpleFormAmountInput
          amount={amount}
          setAmount={setAmount}
          currency="USD"
          accentColor="#3366ff"
        />
      );
    }
    render(<AmountEntry />);
    const input = screen.getByTestId('hero-amount-input');
    fireEvent(input, 'focus');
    fireEvent.changeText(input, '1');
    expect(input.props.selectTextOnFocus).toBeFalsy();
    fireEvent.changeText(input, '12');
    expect(input.props.value).toBe('12');
  });

  it('opens the calculator on demand and completes the handoff', () => {
    const setAmount = jest.fn();
    const onCalculatorDone = jest.fn();
    const dismiss = jest.spyOn(Keyboard, 'dismiss');

    render(
      <SimpleFormAmountInput
        amount=""
        setAmount={setAmount}
        currency="USD"
        accentColor="#3366ff"
        onCalculatorDone={onCalculatorDone}
      />,
    );

    fireEvent.press(screen.getByTestId('amount-input'));
    expect(dismiss).toHaveBeenCalledTimes(1);
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
