import { AmountCalculatorSheet } from '@/src/components/overlays/AmountCalculatorSheet';
import { AppInput } from '@/src/components/core/AppInput';
import { AppText } from '@/src/components/core/AppText';
import { Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { hasNegativeAmountSign } from '@/src/services/journal/simpleJournalHelpers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Keyboard,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

const HERO_AMOUNT_FONT_SIZE = Typography.sizes.hero / 1.5;
const MIN_HERO_AMOUNT_FONT_SIZE = Typography.sizes.xxl;

export function getHeroAmountFontSize(value: string): number {
  const overflowLength = Math.max(0, value.trim().length - 9);
  return Math.max(MIN_HERO_AMOUNT_FONT_SIZE, HERO_AMOUNT_FONT_SIZE - overflowLength * Spacing.xs);
}

interface CalculatorAmountInputProps {
  value: string;
  onChangeText: (value: string) => void;
  currencySymbol?: string;
  showCurrencyPrefix?: boolean;
  showClearButton?: boolean;
  onClear?: () => void;
  precision?: number;
  placeholder?: string;
  label?: string;
  variant?: 'default' | 'hero' | 'minimal';
  inputStyle?: TextInputProps['style'];
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  calculatorTestID?: string;
  editable?: boolean;
  autoFocus?: boolean;
  onFocus?: TextInputProps['onFocus'];
  onBlur?: TextInputProps['onBlur'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  onCalculatorDone?: () => void;
}

export function CalculatorAmountInput({
  value,
  onChangeText,
  currencySymbol = '',
  showCurrencyPrefix = false,
  showClearButton = false,
  onClear,
  precision = 2,
  placeholder = '0.00',
  label,
  variant = 'default',
  inputStyle,
  containerStyle,
  testID,
  calculatorTestID,
  editable = false,
  autoFocus,
  onFocus,
  onBlur,
  onSubmitEditing,
  onCalculatorDone,
}: CalculatorAmountInputProps) {
  const { theme, fonts } = useTheme();
  const [visible, setVisible] = useState(false);
  const calculatorDoneRef = useRef(onCalculatorDone);
  const pendingDoneRef = useRef<(() => void) | null>(null);
  const dismissFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHero = variant === 'hero';
  const currencyPrefix = showCurrencyPrefix && currencySymbol ? currencySymbol : null;

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

  const handleAmountChange = useCallback(
    (nextValue: string) => {
      if (hasNegativeAmountSign(nextValue)) return;
      onChangeText(nextValue);
    },
    [onChangeText],
  );

  const handleCalculatorDone = useCallback(
    (amount: string) => {
      handleAmountChange(amount);
      pendingDoneRef.current = calculatorDoneRef.current ?? null;
      setVisible(false);
      dismissFallbackTimerRef.current = setTimeout(finishCalculatorHandoff, 300);
    },
    [finishCalculatorHandoff, handleAmountChange],
  );

  const resolvedInputStyle = useMemo(
    () => [
      isHero && {
        color: theme.text,
        fontFamily: fonts.semibold,
        fontSize: getHeroAmountFontSize(value),
        letterSpacing: -1,
        minWidth: 0,
        flexShrink: 1,
        textAlign: 'center' as const,
      },
      inputStyle,
    ],
    [fonts.semibold, inputStyle, isHero, theme.text, value],
  );

  return (
    <View style={[styles.wrapper, isHero && styles.heroInput, containerStyle]}>
      <View style={styles.inputRow}>
        {currencyPrefix ? (
          <AppText variant="body" weight="bold" color="secondary" style={styles.currencyPrefix}>
            {currencyPrefix}
          </AppText>
        ) : null}
        <AppInput
          label={label}
          value={value}
          placeholder={placeholder}
          variant={isHero ? 'minimal' : variant}
          containerStyle={styles.inputContainer}
          inputStyle={resolvedInputStyle}
          onChangeText={handleAmountChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmitEditing}
          calculator
          calculatorEditable={editable}
          onCalculatorPress={() => {
            Keyboard.dismiss();
            setVisible(true);
          }}
          calculatorTestID={calculatorTestID ?? (testID ? `${testID}-calculator` : undefined)}
          autoFocus={autoFocus}
          testID={testID}
        />
        {showClearButton && value ? (
          <TouchableOpacity
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear amount"
            testID={testID ? `${testID}-clear` : undefined}
            style={[styles.clearButton, { backgroundColor: theme.surfaceSecondary }]}
          >
            <AppText color="secondary" weight="bold">
              ×
            </AppText>
          </TouchableOpacity>
        ) : null}
      </View>
      <AmountCalculatorSheet
        visible={visible}
        currencySymbol={currencySymbol}
        precision={precision}
        onClose={() => setVisible(false)}
        onDismiss={finishCalculatorHandoff}
        onDone={handleCalculatorDone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heroInput: {
    width: '100%',
    minWidth: 0,
  },
  wrapper: {
    minWidth: 0,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  inputContainer: {
    flex: 1,
    minWidth: 0,
  },
  currencyPrefix: {
    marginRight: Spacing.xs,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.xs,
  },
});
