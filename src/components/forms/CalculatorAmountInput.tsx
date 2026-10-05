import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { AmountCalculatorSheet } from '@/src/components/overlays/AmountCalculatorSheet';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { formPrimitivesStrings as copy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { hasNegativeAmountSign } from '@/src/services/journal/simpleJournalHelpers';
import { Icon } from '@/src/types/domainIcons';
import { withOpacity } from '@/src/utils/color-math';
import { formatRoundedAmount, sanitizeDecimalInput } from '@/src/utils/money';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { resolveAmountTypography } from './amountInputPresentation';

interface CalculatorAmountInputProps {
  value: string;
  onChangeText: (value: string) => void;
  currencySymbol?: string;
  currency?: string;
  currencyCode?: string;
  onCurrencyPress?: () => void;
  accentColor?: string;
  showCurrencyPrefix?: boolean;
  showClearButton?: boolean;
  onClear?: () => void;
  precision?: number;
  placeholder?: string;
  label?: string;
  variant?: 'default' | 'hero' | 'compact' | 'centered';
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

/** Shared amount field with the journal's typography and calculator controls. */
export function CalculatorAmountInput(props: CalculatorAmountInputProps) {
  if (props.variant === 'compact') return <CompactAmountField {...props} />;
  if (props.variant === 'centered') return <CenteredAmountField {...props} />;
  return <AmountField {...props} />;
}

function CompactAmountField({
  value,
  currency = '',
  currencySymbol,
  onChangeText,
  precision,
  placeholder,
  label,
  containerStyle,
  inputStyle,
  testID,
}: CalculatorAmountInputProps) {
  const { theme } = useTheme();
  const normalizedCurrency = currency.trim().toUpperCase();
  const { precision: currencyPrecision } = useCurrencyPrecision(normalizedCurrency);
  const resolvedPrecision = precision ?? currencyPrecision;
  const resolvedCurrencySymbol =
    currencySymbol || CURRENCY_SYMBOLS[normalizedCurrency] || normalizedCurrency || '$';

  return (
    <View
      style={[
        styles.compactWrapper,
        label && styles.compactWrapperWithLabel,
        { backgroundColor: 'transparent', borderColor: theme.border },
        containerStyle,
      ]}
    >
      {label && (
        <AppText
          variant="caption"
          color="tertiary"
          weight="bold"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.compactLabel}
        >
          {label}
        </AppText>
      )}
      <View style={styles.compactInputRow}>
        <AppText
          variant="caption"
          weight="bold"
          style={[styles.compactCurrencyPrefix, { color: theme.textTertiary }]}
        >
          {resolvedCurrencySymbol}
        </AppText>
        <AmountField
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? formatRoundedAmount(0, resolvedPrecision)}
          currencySymbol={resolvedCurrencySymbol}
          precision={resolvedPrecision}
          variant="compact"
          showCurrencyPrefix={false}
          showClearButton={false}
          containerStyle={styles.compactInputContainer}
          inputStyle={[styles.compactAmountInput, inputStyle]}
          testID={testID}
        />
      </View>
    </View>
  );
}

function CenteredAmountField({
  value,
  onChangeText,
  label,
  currencySymbol = '',
  precision = 2,
  currencyCode,
  onCurrencyPress,
  autoFocus,
  placeholder,
  testID = 'hero-amount-input',
}: CalculatorAmountInputProps) {
  const { theme } = useTheme();
  return (
    <View style={styles.centeredWrap}>
      {label ? (
        <AppText variant="caption" weight="semibold" color="secondary" style={styles.centeredLabel}>
          {label}
        </AppText>
      ) : null}
      <AmountField
        value={value}
        onChangeText={onChangeText}
        currencySymbol={currencySymbol}
        precision={precision}
        placeholder={placeholder}
        variant="hero"
        autoFocus={autoFocus}
        testID={testID}
        containerStyle={styles.centeredInputContainer}
        inputStyle={styles.centeredInput}
      />
      {currencyCode ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.currencyAccessibility(currencyCode)}
          onPress={onCurrencyPress}
          disabled={!onCurrencyPress}
          style={[styles.currencyChip, { borderColor: theme.border }]}
        >
          <AppText variant="caption" weight="semibold" color="secondary">
            {currencyCode}
          </AppText>
          <AppIcon name={Icon.ChevronDown} size={Size.iconXs} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function AmountField({
  value,
  onChangeText,
  currencySymbol = '',
  currency,
  accentColor,
  showCurrencyPrefix = true,
  showClearButton,
  onClear,
  precision = 2,
  placeholder,
  label,
  variant = 'default',
  inputStyle,
  containerStyle,
  testID,
  calculatorTestID,
  editable = true,
  autoFocus = false,
  onFocus,
  onBlur,
  onSubmitEditing,
  onCalculatorDone,
}: CalculatorAmountInputProps) {
  const { theme, fonts } = useTheme();
  const color = accentColor ?? theme.primary;
  const inputRef = useRef<TextInput>(null);
  const [calculatorVisible, setCalculatorVisible] = useState(false);
  const [calculatorMounted, setCalculatorMounted] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const calculatorDoneRef = useRef(onCalculatorDone);
  const pendingDoneRef = useRef<(() => void) | null>(null);
  const dismissFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHero = variant === 'hero';
  const isCompact = variant === 'compact';
  const hasAmount = Boolean(value && parseFloat(value) > 0);
  const typography = useMemo(() => resolveAmountTypography(value.length), [value]);

  useEffect(() => {
    calculatorDoneRef.current = onCalculatorDone;
  }, [onCalculatorDone]);

  useEffect(() => {
    if (!autoFocus || !editable) return;
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(focusTimer);
  }, [autoFocus, editable]);

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
    (text: string) => {
      if (hasNegativeAmountSign(text.replace(/,/g, '.'))) return;
      const sanitized = sanitizeDecimalInput(text, precision);
      if (sanitized == null) return;
      onChangeText(sanitized);
    },
    [onChangeText, precision],
  );

  const normalizeAmount = useCallback(() => {
    if (value.endsWith('.')) onChangeText(value.slice(0, -1));
  }, [onChangeText, value]);

  const openCalculator = useCallback(() => {
    Keyboard.dismiss();
    setCalculatorMounted(true);
    setCalculatorVisible(true);
  }, []);

  return (
    <View style={[styles.wrapper, isHero && styles.heroContainer, containerStyle]}>
      {label && (
        <AppText variant="body" weight="medium" style={styles.label}>
          {label}
        </AppText>
      )}
      <TouchableOpacity
        activeOpacity={1}
        accessible={!editable}
        onPress={() => (editable ? inputRef.current?.focus() : openCalculator())}
        accessibilityRole={editable ? undefined : 'button'}
        accessibilityLabel={editable ? undefined : 'Open math calculator'}
        testID={
          !editable
            ? (calculatorTestID ?? (testID ? `${testID}-calculator` : undefined))
            : undefined
        }
        style={[
          styles.amountCanvas,
          isHero && styles.heroCanvas,
          variant === 'default' && [
            styles.defaultCanvas,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ],
        ]}
      >
        <View style={[styles.inputRow, isHero && styles.heroRow]}>
          {showCurrencyPrefix && currencySymbol ? (
            <AppText
              tabular={false}
              weight="bold"
              style={[
                styles.currencyPrefix,
                {
                  color: withOpacity(color, Opacity.heavy),
                  fontFamily: isHero ? Typography.fonts.heading : fonts.bold,
                  fontSize: isHero ? typography.currencyFontSize : Typography.sizes.base,
                  lineHeight: isHero ? typography.currencyLineHeight : undefined,
                },
              ]}
            >
              {currencySymbol}
            </AppText>
          ) : null}
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={handleAmountChange}
            placeholder={isFocused ? '' : (placeholder ?? (isHero ? '0' : '0.00'))}
            placeholderTextColor={withOpacity(color, Opacity.medium)}
            keyboardType="decimal-pad"
            accessibilityLabel={currency ? `Amount in ${currency}` : (label ?? 'Amount')}
            editable={editable}
            pointerEvents={editable ? 'auto' : 'none'}
            onSubmitEditing={event => {
              normalizeAmount();
              Keyboard.dismiss();
              onSubmitEditing?.(event);
            }}
            onFocus={event => {
              setIsFocused(true);
              onFocus?.(event);
            }}
            onBlur={event => {
              setIsFocused(false);
              normalizeAmount();
              onBlur?.(event);
            }}
            numberOfLines={1}
            cursorColor={color}
            selectionColor={withOpacity(color, Opacity.muted)}
            style={[
              styles.input,
              { color, fontFamily: isHero ? fonts.bold : fonts.medium },
              isHero && {
                fontSize: typography.amountFontSize,
                lineHeight: Math.max(Size.buttonMd, typography.amountFontSize + Spacing.md),
                height: typography.inputHeight,
              },
              inputStyle,
            ]}
            testID={testID}
          />
          <View style={styles.actionButtons}>
            {(showClearButton ?? isHero) && hasAmount && (
              <TouchableOpacity
                onPress={() => {
                  if (onClear) onClear();
                  else onChangeText('');
                  if (editable) inputRef.current?.focus();
                }}
                style={[
                  styles.iconButton,
                  isCompact && styles.compactButton,
                  { backgroundColor: theme.surfaceSecondary },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Clear amount"
                testID={testID ? `${testID}-clear` : undefined}
                hitSlop={Spacing.sm}
              >
                <AppIcon name={Icon.Close} size={Size.xs} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={openCalculator}
              style={[
                styles.iconButton,
                isCompact && styles.compactButton,
                { backgroundColor: withOpacity(color, Opacity.soft) },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open math calculator"
              testID={
                editable
                  ? (calculatorTestID ?? (testID ? `${testID}-calculator` : undefined))
                  : undefined
              }
              hitSlop={Spacing.sm}
            >
              <AppIcon name={Icon.Calculator} size={Size.iconXs} color={color} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
      {calculatorMounted && (
        <AmountCalculatorSheet
          visible={calculatorVisible}
          currencySymbol={currencySymbol}
          precision={precision}
          onClose={() => setCalculatorVisible(false)}
          onDismiss={finishCalculatorHandoff}
          onDone={amount => {
            handleAmountChange(amount);
            pendingDoneRef.current = calculatorDoneRef.current ?? null;
            setCalculatorVisible(false);
            dismissFallbackTimerRef.current = setTimeout(finishCalculatorHandoff, 300);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { minWidth: 0 },
  heroContainer: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  label: { marginBottom: Spacing.xs },
  amountCanvas: { minWidth: 0 },
  heroCanvas: { paddingVertical: Spacing.xs },
  defaultCanvas: {
    borderWidth: 1,
    borderRadius: Shape.radius.lg,
    paddingHorizontal: Spacing.sm,
    minHeight: Size.inputMd,
    justifyContent: 'center',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  heroRow: { justifyContent: 'space-between', minHeight: Size.fab },
  currencyPrefix: { marginRight: Spacing.xs, letterSpacing: Typography.letterSpacing.normal },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: Size.touchTarget,
    paddingVertical: 0,
    paddingHorizontal: Spacing.xs,
    margin: 0,
    fontSize: Typography.sizes.base,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  iconButton: {
    width: Size.touchTarget,
    height: Size.touchTarget,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactButton: { width: Size.controlCompact - 2, height: Size.controlCompact - 2 },
  compactWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: Size.controlCompact,
    borderRadius: Shape.radius.lg,
    borderWidth: 1,
  },
  compactWrapperWithLabel: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    height: 'auto',
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  compactLabel: {
    flexShrink: 1,
    paddingHorizontal: Spacing.md,
  },
  compactInputRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.none,
  },
  compactCurrencyPrefix: {
    fontSize: Typography.sizes.xs,
    marginRight: Spacing.xs,
  },
  compactInputContainer: {
    flex: 1,
    minHeight: 0,
  },
  compactAmountInput: {
    height: 28,
    minHeight: 0,
    textAlign: 'right',
    flex: 1,
    paddingVertical: 0,
    paddingRight: Spacing.sm,
  },
  centeredWrap: { alignItems: 'center', width: '100%' },
  centeredLabel: { marginBottom: Spacing.xs, letterSpacing: Typography.letterSpacing.wide },
  centeredInputContainer: { width: '100%', paddingHorizontal: 0 },
  centeredInput: { fontFamily: Typography.fonts.heading },
  currencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: Size.touchTarget,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
});
