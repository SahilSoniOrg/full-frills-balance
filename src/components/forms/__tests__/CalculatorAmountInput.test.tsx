import { CalculatorAmountInput } from '../CalculatorAmountInput';
import { Size, Typography } from '@/src/constants';
import { fireEvent, render, screen, act } from '@/src/utils/test-utils';
import { useState } from 'react';
import { Keyboard, Pressable as MockPressable, StyleSheet } from 'react-native';

jest.mock('@/src/components/overlays/AmountCalculatorSheet', () => ({
  AmountCalculatorSheet: ({
    visible,
    onDone,
    onDismiss,
  }: {
    visible: boolean;
    onDone: (amount: string) => void;
    onDismiss: () => void;
  }) =>
    visible ? (
      <MockPressable
        testID="calculator-done"
        onPress={() => {
          onDone('42.50');
          onDismiss();
        }}
      />
    ) : null,
}));

function AmountField({ precision = 2 }: { precision?: number }) {
  const [value, setValue] = useState('');
  return (
    <CalculatorAmountInput
      value={value}
      onChangeText={setValue}
      precision={precision}
      testID="amount"
      currencySymbol="$"
      showClearButton
    />
  );
}

describe('CalculatorAmountInput', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('applies hero typography and shows the currency symbol', () => {
    render(
      <CalculatorAmountInput
        value="123"
        onChangeText={jest.fn()}
        variant="hero"
        currencySymbol="$"
        testID="amount"
      />,
    );
    expect(StyleSheet.flatten(screen.getByTestId('amount').props.style)).toMatchObject({
      fontSize: Typography.sizes.jumbo,
    });
    expect(screen.getByText('$')).toBeTruthy();
  });

  it('supports direct typing and clearing without selecting the first digit', () => {
    render(<AmountField />);
    const input = screen.getByTestId('amount');
    expect(input.props.editable).toBe(true);
    fireEvent.changeText(input, '1');
    expect(input.props.selectTextOnFocus).toBeFalsy();
    fireEvent.changeText(input, '12,50');
    expect(input.props.value).toBe('12.50');
    fireEvent.press(screen.getByRole('button', { name: 'Clear amount' }));
    expect(input.props.value).toBe('');
  });

  it.each(['-12', '−12', '12.345', '1.2.3'])(
    'rejects invalid or excessive precision: %s',
    value => {
      const onChangeText = jest.fn();
      render(<CalculatorAmountInput value="" onChangeText={onChangeText} testID="amount" />);
      fireEvent.changeText(screen.getByTestId('amount'), value);
      expect(onChangeText).not.toHaveBeenCalled();
    },
  );

  it('respects a currency with no decimal places', () => {
    render(<AmountField precision={0} />);
    const input = screen.getByTestId('amount');
    fireEvent.changeText(input, '120');
    fireEvent.changeText(input, '120.5');
    expect(input.props.value).toBe('120');
  });

  it('opens the calculator on demand and completes the current handoff only once', () => {
    jest.useFakeTimers();
    const onChangeText = jest.fn();
    const oldDone = jest.fn();
    const newDone = jest.fn();
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const view = render(
      <CalculatorAmountInput
        value=""
        onChangeText={onChangeText}
        onCalculatorDone={oldDone}
        testID="amount"
      />,
    );
    expect(screen.queryByTestId('calculator-done')).toBeNull();
    fireEvent.press(screen.getByTestId('amount-calculator'));
    expect(dismiss).toHaveBeenCalledTimes(1);
    view.rerender(
      <CalculatorAmountInput
        value=""
        onChangeText={onChangeText}
        onCalculatorDone={newDone}
        testID="amount"
      />,
    );
    fireEvent.press(screen.getByTestId('calculator-done'));
    act(() => jest.runOnlyPendingTimers());
    expect(onChangeText).toHaveBeenCalledWith('42.50');
    expect(oldDone).not.toHaveBeenCalled();
    expect(newDone).toHaveBeenCalledTimes(1);
  });

  it('still supports calculator-only fields', () => {
    render(
      <CalculatorAmountInput value="" onChangeText={jest.fn()} editable={false} testID="amount" />,
    );
    expect(screen.getByTestId('amount').props.editable).toBe(false);
    fireEvent.press(screen.getByTestId('amount-calculator'));
    expect(screen.getByTestId('calculator-done')).toBeTruthy();
  });

  it('keeps the compact calculator inside narrow amount rows', () => {
    render(
      <CalculatorAmountInput
        value="12"
        onChangeText={jest.fn()}
        variant="compact"
        showClearButton={false}
        testID="amount"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Clear amount' })).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('amount-calculator').props.style)).toMatchObject({
      height: Size.controlCompact - 2,
      width: Size.controlCompact - 2,
    });
  });
});

describe('CalculatorAmountInput hero entry', () => {
  afterEach(() => jest.restoreAllMocks());

  it('normalizes an unfinished decimal on blur without dismissing the next input keyboard', () => {
    const setAmount = jest.fn();
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    render(
      <CalculatorAmountInput
        variant="hero"
        testID="hero-amount-input"
        calculatorTestID="amount-input"
        currencySymbol="$"
        value="12."
        onChangeText={setAmount}
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
        <CalculatorAmountInput
          variant="hero"
          testID="hero-amount-input"
          calculatorTestID="amount-input"
          currencySymbol="$"
          value={amount}
          onChangeText={setAmount}
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
      <CalculatorAmountInput
        variant="hero"
        testID="hero-amount-input"
        calculatorTestID="amount-input"
        currencySymbol="$"
        value=""
        onChangeText={setAmount}
        currency="USD"
        accentColor="#3366ff"
        onCalculatorDone={onCalculatorDone}
      />,
    );

    fireEvent.press(screen.getByTestId('amount-input'));
    expect(dismiss).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('calculator-done'));
    expect(setAmount).toHaveBeenCalledWith('42.50');
    expect(onCalculatorDone).toHaveBeenCalledTimes(1);
  });

  it('normalizes comma decimal input without changing its magnitude', () => {
    const setAmount = jest.fn();

    render(
      <CalculatorAmountInput
        variant="hero"
        testID="hero-amount-input"
        calculatorTestID="amount-input"
        currencySymbol="$"
        value=""
        onChangeText={setAmount}
        currency="EUR"
        accentColor="#3366ff"
      />,
    );

    fireEvent.changeText(screen.getByTestId('hero-amount-input'), '12,50');

    expect(setAmount).toHaveBeenCalledWith('12.50');
  });
});
