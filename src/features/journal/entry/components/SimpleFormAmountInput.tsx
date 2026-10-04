import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { hasNegativeAmountSign } from '@/src/services/journal/simpleJournalHelpers';
import React, { useCallback, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

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
  const [isFocused, setIsFocused] = useState(false);
  const { precision: currencyPrecision } = useCurrencyPrecision(currency.trim().toUpperCase());
  const resolvedPrecision = precision ?? currencyPrecision;

  const handleChangeText = useCallback(
    (text: string) => {
      const normalized = text.replace(/,/g, '.');
      if (hasNegativeAmountSign(normalized)) return;
      const sanitized = normalized.replace(/[^0-9.]/g, '');
      const parts = sanitized.split('.');
      if (parts.length > 2) return;
      if (parts[1] && parts[1].length > resolvedPrecision) return;
      setAmount(sanitized);
    },
    [resolvedPrecision, setAmount],
  );

  const handleClear = useCallback(() => {
    setAmount('');
  }, [setAmount]);

  const normalizeAmount = useCallback(() => {
    if (amount.endsWith('.')) {
      setAmount(amount.slice(0, -1));
    }
  }, [amount, setAmount]);

  const handleDone = useCallback(() => {
    normalizeAmount();
    Keyboard.dismiss();
  }, [normalizeAmount]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    normalizeAmount();
  }, [normalizeAmount]);

  const currencySymbol = useMemo(
    () => CURRENCY_SYMBOLS[currency.trim().toUpperCase()] || currency || '$',
    [currency],
  );

  return (
    <CalculatorAmountInput
      value={amount}
      onChangeText={handleChangeText}
      currencySymbol={currencySymbol}
      showCurrencyPrefix
      showClearButton={Boolean(amount && parseFloat(amount) > 0)}
      onClear={handleClear}
      precision={resolvedPrecision}
      placeholder={isFocused ? '' : '0'}
      variant="hero"
      inputStyle={{ color: accentColor }}
      editable
      autoFocus={autoFocusAmount}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onSubmitEditing={handleDone}
      onCalculatorDone={onCalculatorDone}
      calculatorTestID="amount-input"
      testID={testID}
    />
  );
});
