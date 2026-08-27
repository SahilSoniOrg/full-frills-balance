import { ModalSurface } from '@/src/components/common/ModalSurface';
import { AppButton, AppText } from '@/src/components/core';
import { Shape, Size, Spacing, Typography } from '@/src/constants';
import {
  evaluateAmountExpression,
  formatAmountExpressionValue,
} from '@/src/features/journal/entry/utils/amountExpression';
import { useTheme } from '@/src/hooks/use-theme';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  TextInputSelectionChangeEventData,
  TouchableOpacity,
  View,
} from 'react-native';

type CalculatorKey =
  'digit' | 'decimal' | 'operator' | 'parenthesis' | 'clear' | 'backspace' | 'equals';

interface AmountCalculatorSheetProps {
  visible: boolean;
  initialAmount: string;
  currencySymbol: string;
  precision: number;
  onClose: () => void;
  onDone: (amount: string) => void;
}

const rows: { label: string; value: string; type: CalculatorKey }[][] = [
  [
    { label: 'C', value: 'clear', type: 'clear' },
    { label: '(', value: '(', type: 'parenthesis' },
    { label: ')', value: ')', type: 'parenthesis' },
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
    { label: '⌫', value: 'backspace', type: 'backspace' },
    { label: '=', value: 'equals', type: 'equals' },
  ],
];

function isOperator(value: string): boolean {
  return '+-*/'.includes(value);
}

function currentNumber(expression: string): string {
  return expression.split(/[+\-*/]/).pop() || '';
}

function hasUnmatchedOpeningParenthesis(expression: string): boolean {
  let balance = 0;
  for (const char of expression) {
    if (char === '(') balance += 1;
    if (char === ')') balance -= 1;
  }
  return balance > 0;
}

function insertAt(expression: string, cursorIndex: number, value: string): string {
  return `${expression.slice(0, cursorIndex)}${value}${expression.slice(cursorIndex)}`;
}

export function AmountCalculatorSheet({
  visible,
  initialAmount,
  currencySymbol,
  precision,
  onClose,
  onDone,
}: AmountCalculatorSheetProps) {
  const { theme } = useTheme();
  const [expression, setExpression] = useState(initialAmount || '');
  const [cursorIndex, setCursorIndex] = useState((initialAmount || '').length);
  const [replaceInitial, setReplaceInitial] = useState(!initialAmount);
  const [hasEvaluated, setHasEvaluated] = useState(false);
  const expressionInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    const focusTimer = setTimeout(() => expressionInputRef.current?.focus(), 100);
    return () => clearTimeout(focusTimer);
  }, [visible]);

  const result = useMemo(
    () => evaluateAmountExpression(expression, precision),
    [expression, precision],
  );
  const resultText = result.ok ? formatAmountExpressionValue(result.value, precision) : '';
  const resultDisplay = result.ok ? resultText : expression ? '—' : '0';
  const isAmountInvalid = result.ok && result.value <= 0;
  const canSubmit = result.ok && result.value > 0;

  const appendDigit = (value: string) => {
    setExpression(current => {
      const insertionIndex = Math.min(cursorIndex, current.length);
      if (replaceInitial || hasEvaluated) {
        setCursorIndex(value.length);
        return value;
      }
      if (current === '0' && value !== '00') {
        setCursorIndex(1);
        return value;
      }
      const next = insertAt(current, insertionIndex, value);
      setCursorIndex(insertionIndex + value.length);
      return next;
    });
    setReplaceInitial(false);
    setHasEvaluated(false);
  };

  const appendDecimal = () => {
    setExpression(current => {
      const insertionIndex = Math.min(cursorIndex, current.length);
      if (replaceInitial || hasEvaluated) {
        setCursorIndex(2);
        return '0.';
      }
      const beforeCursor = current.slice(0, insertionIndex);
      if (currentNumber(beforeCursor).includes('.')) return current;
      const value =
        insertionIndex === 0 || isOperator(current[insertionIndex - 1] || '') ? '0.' : '.';
      const next = insertAt(current, insertionIndex, value);
      setCursorIndex(insertionIndex + value.length);
      return next;
    });
    setReplaceInitial(false);
    setHasEvaluated(false);
  };

  const appendOperator = (operator: string) => {
    setExpression(current => {
      const insertionIndex = Math.min(cursorIndex, current.length);
      const previous = current[insertionIndex - 1] || '';
      const nextCharacter = current[insertionIndex] || '';
      if (isOperator(previous)) {
        const next = `${current.slice(0, insertionIndex - 1)}${operator}${current.slice(insertionIndex)}`;
        setCursorIndex(insertionIndex);
        return next;
      }
      if (isOperator(nextCharacter)) {
        const next = `${current.slice(0, insertionIndex)}${operator}${current.slice(insertionIndex + 1)}`;
        setCursorIndex(insertionIndex + 1);
        return next;
      }
      if (!/\d|\)/.test(previous)) return current;
      const next = insertAt(current, insertionIndex, operator);
      setCursorIndex(insertionIndex + 1);
      return next;
    });
    setReplaceInitial(false);
    setHasEvaluated(false);
  };

  const appendParentheses = (value: string) => {
    setExpression(current => {
      const insertionIndex = Math.min(cursorIndex, current.length);
      if (replaceInitial || hasEvaluated) {
        if (value === ')') return current;
        setCursorIndex(1);
        return value;
      }
      if (
        value === ')' &&
        (!hasUnmatchedOpeningParenthesis(current.slice(0, insertionIndex)) ||
          !current.slice(0, insertionIndex) ||
          isOperator(current[insertionIndex - 1] || '') ||
          current[insertionIndex - 1] === '(')
      ) {
        return current;
      }
      const next = insertAt(current, insertionIndex, value);
      setCursorIndex(insertionIndex + 1);
      return next;
    });
    setReplaceInitial(false);
    setHasEvaluated(false);
  };

  const handleKey = (value: string, type: CalculatorKey) => {
    if (type === 'digit') appendDigit(value);
    if (type === 'decimal') appendDecimal();
    if (type === 'operator') appendOperator(value);
    if (type === 'parenthesis') appendParentheses(value);
    if (type === 'clear') {
      setExpression('');
      setCursorIndex(0);
      setReplaceInitial(true);
      setHasEvaluated(false);
    }
    if (type === 'backspace') {
      setExpression(current => {
        const deletionIndex = Math.min(cursorIndex, current.length);
        if (deletionIndex === 0) return current;
        const next = `${current.slice(0, deletionIndex - 1)}${current.slice(deletionIndex)}`;
        setCursorIndex(deletionIndex - 1);
        return next;
      });
      setHasEvaluated(false);
    }
    if (type === 'equals' && result.ok) {
      setExpression(resultText);
      setCursorIndex(resultText.length);
      setReplaceInitial(false);
      setHasEvaluated(true);
    }
  };

  return (
    <ModalSurface
      visible={visible}
      title="Enter amount"
      onClose={onClose}
      position="bottomSheet"
      fixedHeight={false}
      scrollable={false}
      accessibilityCloseLabel="Close amount calculator"
    >
      <View style={styles.display} testID="amount-calculator-display">
        <View style={[styles.expressionField, { backgroundColor: theme.surfaceSecondary }]}>
          <TextInput
            ref={expressionInputRef}
            value={expression || '0'}
            selection={{
              start: Math.min(cursorIndex, (expression || '0').length),
              end: Math.min(cursorIndex, (expression || '0').length),
            }}
            onSelectionChange={(event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) =>
              setCursorIndex(event.nativeEvent.selection.start)
            }
            onChangeText={text => {
              setExpression(text);
              setCursorIndex(text.length);
            }}
            showSoftInputOnFocus={false}
            caretHidden={false}
            cursorColor={theme.primary}
            contextMenuHidden
            style={[styles.expression, { color: theme.text }]}
            numberOfLines={1}
            textAlign="center"
            accessibilityLabel={`Expression ${expression || '0'}`}
          />
        </View>
        <View style={styles.resultRow}>
          {result.ok && (
            <AppText
              variant="heading"
              weight="bold"
              style={{ color: isAmountInvalid ? theme.textTertiary : theme.primary }}
            >
              {currencySymbol}
            </AppText>
          )}
          <AppText
            variant="hero"
            weight="bold"
            style={[
              styles.resultAmount,
              { color: result.ok && !isAmountInvalid ? theme.primary : theme.textTertiary },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            accessibilityLabel={
              result.ok
                ? isAmountInvalid
                  ? `Invalid calculated amount ${currencySymbol}${resultText}`
                  : `Calculated amount ${currencySymbol}${resultText}`
                : 'Calculated amount unavailable'
            }
          >
            {resultDisplay}
          </AppText>
        </View>
        {isAmountInvalid && (
          <AppText
            variant="caption"
            align="center"
            style={{ color: theme.textSecondary }}
            testID="amount-calculator-invalid"
          >
            Amount must be greater than 0
          </AppText>
        )}
        {!result.ok && expression.length > 0 && !result.incomplete && (
          <AppText variant="caption" color="error" testID="amount-calculator-error">
            {result.error}
          </AppText>
        )}
      </View>

      <View style={styles.keypad}>
        {rows.map((row, rowIndex) => (
          <View style={styles.keyRow} key={`calculator-row-${rowIndex}`}>
            {row.map(key => {
              const isAction = key.type === 'operator' || key.type === 'equals';
              return (
                <TouchableOpacity
                  key={`${key.type}-${key.value}`}
                  onPress={() => handleKey(key.value, key.type)}
                  style={[
                    styles.key,
                    { backgroundColor: isAction ? theme.primary : theme.surfaceSecondary },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={key.label}
                  testID={`amount-calculator-key-${key.value}`}
                >
                  <AppText
                    variant="subheading"
                    weight="bold"
                    style={[styles.keyLabel, { color: isAction ? theme.onPrimary : theme.text }]}
                  >
                    {key.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <AppButton variant="outline" onPress={onClose} style={styles.actionButton}>
          Cancel
        </AppButton>
        <AppButton
          variant="primary"
          disabled={!canSubmit}
          onPress={() => onDone(resultText)}
          style={styles.actionButton}
          testID="amount-calculator-done"
        >
          Done
        </AppButton>
      </View>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  display: {
    minHeight: 124,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Shape.radius.r3,
  },
  expression: {
    width: '100%',
  },
  expressionField: {
    width: '100%',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: Shape.radius.r3,
    marginBottom: Spacing.md,
  },
  resultRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  resultAmount: {
    fontSize: Typography.sizes.hero + Spacing.sm,
    lineHeight: Typography.sizes.hero + Spacing.md,
    maxWidth: '86%',
  },
  keypad: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
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
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  actionButton: {
    flex: 1,
  },
});
