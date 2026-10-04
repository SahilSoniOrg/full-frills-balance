import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import React from 'react';

export interface SimpleFormAmountInputProps {
  amount: string;
  setAmount: (val: string) => void;
  currency: string;
  accentColor: string;
  precision?: number;
  autoFocusAmount?: boolean;
  onCalculatorDone?: () => void;
  testID?: string;
}

export const SimpleFormAmountInput = React.memo(function SimpleFormAmountInput({
  amount,
  setAmount,
  currency,
  accentColor,
  precision = 2,
  autoFocusAmount = false,
  onCalculatorDone,
  testID = 'hero-amount-input',
}: SimpleFormAmountInputProps) {
  return (
    <CalculatorAmountInput
      value={amount}
      onChangeText={setAmount}
      currency={currency}
      currencySymbol={CURRENCY_SYMBOLS[currency] || currency || '$'}
      accentColor={accentColor}
      precision={precision}
      variant="hero"
      autoFocus={autoFocusAmount}
      onCalculatorDone={onCalculatorDone}
      testID={testID}
      calculatorTestID="amount-input"
    />
  );
});
