import { AppButton, AppText } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Shape, Size, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import {
  evaluateCalculatorExpression,
  formatRationalToCurrency,
} from '@/src/utils/amountExpression';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

type CalculatorKeyType = 'utility' | 'digit' | 'decimal' | 'operator' | 'backspace' | 'equals';

type CalculatorKey = {
  label: string;
  value: string;
  type: CalculatorKeyType;
};

interface AmountCalculatorSheetProps {
  visible: boolean;
  /** Kept for API compatibility. Every opening intentionally starts empty. */
  initialAmount: string;
  currencySymbol: string;
  precision: number;
  onClose: () => void;
  onDone: (amount: string) => void;
  onDismiss?: () => void;
}

const rows: CalculatorKey[][] = [
  [
    { label: 'AC', value: 'AC', type: 'utility' },
    { label: 'C', value: 'C', type: 'utility' },
    { label: '⌫', value: 'backspace', type: 'backspace' },
    { label: '÷', value: '/', type: 'operator' },
  ],
  [
    { label: '7', value: '7', type: 'digit' },
    { label: '8', value: '8', type: 'digit' },
    { label: '9', value: '9', type: 'digit' },
    { label: '×', value: '*', type: 'operator' },
  ],
  [
    { label: '4', value: '4', type: 'digit' },
    { label: '5', value: '5', type: 'digit' },
    { label: '6', value: '6', type: 'digit' },
    { label: '−', value: '-', type: 'operator' },
  ],
  [
    { label: '1', value: '1', type: 'digit' },
    { label: '2', value: '2', type: 'digit' },
    { label: '3', value: '3', type: 'digit' },
    { label: '+', value: '+', type: 'operator' },
  ],
  [
    { label: '.', value: '.', type: 'decimal' },
    { label: '0', value: '0', type: 'digit' },
    { label: '00', value: '00', type: 'digit' },
    { label: '=', value: '=', type: 'equals' },
  ],
];

function isOperator(value: string): boolean {
  return value === '+' || value === '-' || value === '*' || value === '/';
}

function currentOperand(expression: string): string {
  return expression.split(/[+\-*/]/).at(-1) ?? '';
}

function displayExpression(expression: string): string {
  return expression
    .replace(/\s+/g, '')
    .replace(/\*/g, ' × ')
    .replace(/\//g, ' ÷ ')
    .replace(/-/g, ' − ')
    .replace(/\+/g, ' + ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTypedExpression(value: string): string {
  const normalized = value
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/[^0-9.+*/\-]/g, '');
  return normalized.replace(/(^|[+\-*/])0+(?=\d)/g, '$1');
}

function zeroForPrecision(precision: number): string {
  return formatRationalToCurrency({ numerator: 0n, denominator: 1n }, precision);
}

export function AmountCalculatorSheet({
  visible,
  initialAmount,
  currencySymbol,
  precision,
  onClose,
  onDone,
  onDismiss,
}: AmountCalculatorSheetProps) {
  const { theme } = useTheme();
  const expressionInputRef = useRef<TextInput>(null);
  const [expression, setExpression] = useState('');
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // The calculator is an amount-entry surface, not an editor for the prior
  // transaction amount. Keep the prop for existing callers, but deliberately
  // reset on each opening.
  void initialAmount;

  useEffect(() => {
    if (!visible) return;
    const focusTimer = setTimeout(() => expressionInputRef.current?.focus(), 100);
    return () => clearTimeout(focusTimer);
  }, [visible]);

  const evaluation = useMemo(
    () => evaluateCalculatorExpression(expression, precision),
    [expression, precision],
  );
  const hasUserInput = expression.length > 0;
  const resultDisplay =
    evaluation.formattedValue ?? (hasUserInput ? '—' : zeroForPrecision(precision));
  const detailsAvailable = Boolean(evaluation.exactValue && evaluation.detailedValue);
  const showError = Boolean(
    evaluation.errorMessage && evaluation.error !== 'NEGATIVE_RESULT' && hasUserInput,
  );

  const setExpressionFromInput = (value: string) => {
    setExpression(normalizeTypedExpression(value));
    setDetailsExpanded(false);
  };

  const appendDigit = (value: string) => {
    setExpression(current => {
      const operand = currentOperand(current);
      const hasDecimal = operand.includes('.');
      const fractionalDigits = operand.split('.')[1]?.length ?? 0;
      const nextDigits = value === '00' ? 2 : 1;
      if (hasDecimal && fractionalDigits + nextDigits > precision) return current;
      if (!hasDecimal && operand === '0') {
        if (value === '00') return current;
        return `${current.slice(0, -1)}${value}`;
      }
      if (!current && value === '00') return '0';
      return `${current}${value}`;
    });
    setDetailsExpanded(false);
  };

  const appendDecimal = () => {
    if (precision === 0) return;
    setExpression(current => {
      const operand = currentOperand(current);
      if (operand.includes('.')) return current;
      return `${current}${operand ? '.' : '0.'}`;
    });
    setDetailsExpanded(false);
  };

  const appendOperator = (operator: string) => {
    setExpression(current => {
      if (!current) return current;
      if (isOperator(current.at(-1) ?? '')) {
        return `${current.slice(0, -1)}${operator}`;
      }
      return `${current}${operator}`;
    });
    setDetailsExpanded(false);
  };

  const clearCurrentOperand = () => {
    setExpression(current => {
      if (!current || isOperator(current.at(-1) ?? '')) return current;
      const operatorIndex = Math.max(
        current.lastIndexOf('+'),
        current.lastIndexOf('-'),
        current.lastIndexOf('*'),
        current.lastIndexOf('/'),
      );
      return current.slice(0, operatorIndex + 1);
    });
    setDetailsExpanded(false);
  };

  const backspace = () => {
    setExpression(current => (current ? current.slice(0, -1) : current));
    setDetailsExpanded(false);
  };

  const allClear = () => {
    setExpression('');
    setDetailsExpanded(false);
  };

  const resetCalculator = () => {
    setExpression('');
    setDetailsExpanded(false);
  };

  const handleClose = () => {
    resetCalculator();
    onClose();
  };

  const handleDismiss = () => {
    resetCalculator();
    onDismiss?.();
  };

  const handleEquals = () => {
    if (!evaluation.canSubmit || !evaluation.formattedValue) return;
    setExpression(evaluation.formattedValue);
    setDetailsExpanded(false);
  };

  const handleDone = () => {
    if (!evaluation.canSubmit || !evaluation.formattedValue) return;
    resetCalculator();
    onDone(evaluation.formattedValue);
  };

  const handleKey = (key: CalculatorKey) => {
    switch (key.type) {
      case 'digit':
        appendDigit(key.value);
        break;
      case 'decimal':
        appendDecimal();
        break;
      case 'operator':
        appendOperator(key.value);
        break;
      case 'backspace':
        backspace();
        break;
      case 'utility':
        if (key.value === 'AC') {
          allClear();
        } else {
          clearCurrentOperand();
        }
        break;
      case 'equals':
        handleEquals();
        break;
    }
  };

  return (
    <ModalSurface
      visible={visible}
      title="Enter amount"
      onClose={handleClose}
      position="bottomSheet"
      fixedHeight={false}
      scrollable={false}
      accessibilityCloseLabel="Close amount calculator"
      closeTestID="amount-calculator-close"
      onDismiss={handleDismiss}
    >
      <View style={styles.display} testID="amount-calculator-display">
        <TextInput
          ref={expressionInputRef}
          value={displayExpression(expression)}
          onChangeText={setExpressionFromInput}
          showSoftInputOnFocus={false}
          caretHidden
          contextMenuHidden
          placeholder="Enter amount"
          placeholderTextColor={theme.textTertiary}
          style={[styles.expression, { color: theme.textSecondary }]}
          numberOfLines={1}
          textAlign="right"
          accessibilityLabel={`Expression${expression ? ` ${displayExpression(expression)}` : ''}`}
          testID="amount-calculator-expression"
        />

        <View style={styles.resultRow}>
          <AppText
            variant="hero"
            weight="bold"
            style={[
              styles.resultAmount,
              { color: evaluation.error === 'NEGATIVE_RESULT' ? theme.error : theme.primary },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            accessibilityLabel={`Calculated amount ${currencySymbol}${resultDisplay}`}
          >
            <AppText
              variant="heading"
              weight="bold"
              style={[
                styles.currencyPrefix,
                {
                  color: evaluation.error === 'NEGATIVE_RESULT' ? theme.error : theme.primary,
                },
              ]}
            >
              {currencySymbol}
            </AppText>
            {resultDisplay}
          </AppText>
        </View>

        {showError && (
          <AppText
            variant="caption"
            align="right"
            style={{ color: theme.error, marginTop: Spacing.xs }}
            testID="amount-calculator-error"
          >
            {evaluation.errorMessage}
          </AppText>
        )}

        {detailsAvailable && (
          <>
            <TouchableOpacity
              onPress={() => setDetailsExpanded(current => !current)}
              style={styles.detailsToggle}
              accessibilityRole="button"
              accessibilityLabel={
                detailsExpanded ? 'Hide calculation details' : 'Calculation details'
              }
              testID="amount-calculator-details-toggle"
            >
              <AppText variant="caption" weight="semibold" style={{ color: theme.primary }}>
                {detailsExpanded ? 'Hide details' : 'Calculation details'}
              </AppText>
            </TouchableOpacity>

            {detailsExpanded && (
              <View
                style={[styles.detailsPanel, { backgroundColor: theme.surfaceSecondary }]}
                testID="amount-calculator-details"
              >
                <AppText variant="caption" color="secondary">
                  Expression
                </AppText>
                <AppText variant="body" weight="semibold" align="right">
                  {displayExpression(expression)}
                </AppText>
                <AppText variant="caption" color="secondary">
                  Detailed result
                </AppText>
                <AppText variant="body" weight="semibold" align="right">
                  {evaluation.detailedValue}
                </AppText>
                <AppText variant="caption" color="secondary">
                  Amount on submission
                </AppText>
                <AppText variant="body" weight="semibold" align="right">
                  {currencySymbol}
                  {evaluation.formattedValue}
                </AppText>
              </View>
            )}
          </>
        )}

        {evaluation.error === 'NEGATIVE_RESULT' && (
          <AppText
            variant="caption"
            style={{ color: theme.error }}
            testID="amount-calculator-invalid"
          >
            Amount cannot be negative
          </AppText>
        )}
      </View>

      <View style={styles.keypad}>
        {rows.map((row, rowIndex) => (
          <View style={styles.keyRow} key={`calculator-row-${rowIndex}`}>
            {row.map(key => {
              const isEquals = key.type === 'equals';
              const isOperatorKey = key.type === 'operator';
              const isDisabled =
                (key.type === 'decimal' && precision === 0) || (isEquals && !evaluation.canSubmit);
              const backgroundColor = isDisabled
                ? theme.surfaceSecondary
                : isEquals || isOperatorKey
                  ? theme.primaryLight
                  : theme.surfaceSecondary;
              const textColor = isDisabled
                ? theme.textTertiary
                : isEquals || isOperatorKey
                  ? theme.primary
                  : theme.text;
              const testID = isEquals
                ? 'amount-calculator-equals'
                : `amount-calculator-key-${key.value}`;

              return (
                <TouchableOpacity
                  key={`${key.type}-${key.value}`}
                  onPress={() => handleKey(key)}
                  disabled={isDisabled}
                  activeOpacity={0.72}
                  style={[
                    styles.key,
                    { backgroundColor },
                    isDisabled && { borderColor: theme.border, borderWidth: 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={key.label}
                  accessibilityState={{ disabled: isDisabled }}
                  testID={testID}
                >
                  <AppText
                    variant="subheading"
                    weight="bold"
                    style={[styles.keyLabel, { color: textColor }]}
                  >
                    {key.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <AppButton
        variant={evaluation.canSubmit ? 'primary' : 'secondary'}
        size="lg"
        style={styles.doneButton}
        onPress={handleDone}
        disabled={!evaluation.canSubmit}
        accessibilityLabel="Done"
        testID="amount-calculator-done"
      >
        Done
      </AppButton>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  display: {
    minHeight: 126,
    justifyContent: 'flex-end',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderRadius: Shape.radius.r3,
  },
  expression: {
    minHeight: Size.buttonMd,
    width: '100%',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 0,
    fontSize: Typography.sizes.lg,
    fontVariant: ['tabular-nums'],
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  resultRow: {
    width: '100%',
    alignItems: 'flex-end',
    paddingTop: Spacing.xs,
  },
  resultAmount: {
    width: '100%',
    flexShrink: 1,
    fontSize: Typography.sizes.hero + Spacing.sm,
    lineHeight: Typography.sizes.hero + Spacing.md,
    textAlign: 'right',
  },
  currencyPrefix: {
    fontSize: Typography.sizes.lg,
    lineHeight: Typography.sizes.lg,
  },
  detailsToggle: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  detailsPanel: {
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Shape.radius.r3,
  },
  keypad: {
    gap: Spacing.sm,
  },
  doneButton: {
    width: '100%',
  },
  keyRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  key: {
    flex: 1,
    minHeight: Size.buttonLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Shape.radius.r3,
  },
  keyLabel: {
    fontSize: Typography.sizes.xxl,
    lineHeight: Typography.sizes.xxl + Spacing.xs,
  },
});
