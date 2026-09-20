import { Icon, AppIcon, AppText } from '@/src/components/core';
import { AmountCalculatorSheet } from '@/src/components/overlays/AmountCalculatorSheet';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { resolveSimpleAmountTypography } from '@/src/features/journal/entry/journalEntryPresentation';
import { withOpacity } from '@/src/utils/color-math';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

export interface SimpleFormAmountInputProps {
  amount: string;
  setAmount: (val: string) => void;
  currency: string;
  accentColor: string;
  precision?: number;
  autoOpenCalculator?: boolean;
  onCalculatorDone?: () => void;
}

export const SimpleFormAmountInput = React.memo(function SimpleFormAmountInput({
  amount,
  setAmount,
  currency,
  accentColor,
  precision = 2,
  autoOpenCalculator = false,
  onCalculatorDone,
}: SimpleFormAmountInputProps) {
  const { theme, fonts } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [calculatorVisible, setCalculatorVisible] = useState(autoOpenCalculator);
  const calculatorDoneRef = useRef(onCalculatorDone);
  const pendingDoneRef = useRef<(() => void) | null>(null);
  const dismissFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    calculatorDoneRef.current = onCalculatorDone;
  }, [onCalculatorDone]);

  useEffect(
    () => () => {
      if (dismissFallbackTimerRef.current) clearTimeout(dismissFallbackTimerRef.current);
    },
    [],
  );

  const finishCalculatorHandoff = useCallback(() => {
    const onDone = pendingDoneRef.current;
    if (!onDone) return;
    pendingDoneRef.current = null;
    if (dismissFallbackTimerRef.current) {
      clearTimeout(dismissFallbackTimerRef.current);
      dismissFallbackTimerRef.current = null;
    }
    onDone();
  }, []);

  const currencySymbol = useMemo(() => CURRENCY_SYMBOLS[currency] || currency || '$', [currency]);

  const handleChangeText = useCallback(
    (text: string) => {
      // Accept the decimal comma used by some locales and keyboards.
      const normalized = text.replace(/,/g, '.');
      const sanitized = normalized.replace(/[^0-9.]/g, '');
      const parts = sanitized.split('.');
      if (parts.length > 2) return;
      if (parts[1] && parts[1].length > precision) return;
      setAmount(sanitized);
    },
    [precision, setAmount],
  );

  const handleClear = useCallback(() => {
    setAmount('');
    inputRef.current?.focus();
  }, [setAmount]);

  const handleDone = useCallback(() => {
    Keyboard.dismiss();
    if (amount.endsWith('.')) {
      setAmount(amount.slice(0, -1));
    }
  }, [amount, setAmount]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    handleDone();
  }, [handleDone]);

  const hasAmount = Boolean(amount && parseFloat(amount) > 0);
  const { amountFontSize, currencyFontSize, currencyLineHeight, inputHeight } = useMemo(
    () => resolveSimpleAmountTypography((amount || '').length),
    [amount],
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => inputRef.current?.focus()}
        style={styles.amountCanvas}
      >
        <View style={styles.amountInputRow}>
          {/* Currency Prefix */}
          <AppText
            tabular={false}
            weight="bold"
            style={[
              styles.currencyPrefix,
              {
                color: withOpacity(accentColor, Opacity.heavy),
                fontSize: currencyFontSize,
                lineHeight: currencyLineHeight,
                fontFamily: fonts.bold,
              },
            ]}
          >
            {currencySymbol}
          </AppText>

          {/* Inline Editable Amount Input */}
          <TextInput
            ref={inputRef}
            value={amount}
            onChangeText={handleChangeText}
            placeholder={isFocused ? '' : '0'}
            placeholderTextColor={withOpacity(accentColor, Opacity.medium)}
            keyboardType="decimal-pad"
            onSubmitEditing={handleDone}
            onFocus={handleFocus}
            onBlur={handleBlur}
            selectTextOnFocus
            numberOfLines={1}
            cursorColor={accentColor}
            selectionColor={withOpacity(accentColor, Opacity.muted)}
            style={[
              styles.input,
              {
                color: accentColor,
                fontFamily: fonts.bold,
                fontSize: amountFontSize,
                height: inputHeight,
              },
            ]}
            testID="hero-amount-input"
          />

          {/* Action Accessories */}
          <View style={styles.actionButtons}>
            {hasAmount && (
              <TouchableOpacity
                onPress={handleClear}
                style={[styles.iconButton, { backgroundColor: theme.surfaceSecondary }]}
                accessibilityRole="button"
                accessibilityLabel="Clear amount"
                hitSlop={{
                  top: Spacing.sm,
                  bottom: Spacing.sm,
                  left: Spacing.sm,
                  right: Spacing.sm,
                }}
              >
                <AppIcon name={Icon.Close} size={Size.xs} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setCalculatorVisible(true)}
              style={[
                styles.iconButton,
                { backgroundColor: withOpacity(accentColor, Opacity.soft) },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open math calculator"
              testID="amount-input"
              hitSlop={{ top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm }}
            >
              <AppIcon name={Icon.Calculator} size={Size.iconXs} color={accentColor} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>

      {/* Full Expression Math Calculator Modal */}
      <AmountCalculatorSheet
        visible={calculatorVisible}
        initialAmount={amount}
        currencySymbol={currencySymbol}
        precision={precision}
        onClose={() => setCalculatorVisible(false)}
        onDismiss={finishCalculatorHandoff}
        onDone={val => {
          setAmount(val);
          pendingDoneRef.current = calculatorDoneRef.current ?? null;
          setCalculatorVisible(false);
          dismissFallbackTimerRef.current = setTimeout(finishCalculatorHandoff, 300);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  amountCanvas: {
    paddingVertical: Spacing.xs,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Size.fab,
  },
  currencyPrefix: {
    marginRight: Spacing.xs,
    letterSpacing: Typography.letterSpacing.normal,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.xs,
    paddingRight: Spacing.xs,
    margin: 0,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  iconButton: {
    width: Size.iconLg,
    height: Size.iconLg,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
