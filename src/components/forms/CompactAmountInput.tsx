import { AppText } from '@/src/components/core';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import type { StyleProp, TextInputProps, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { CalculatorAmountInput } from './CalculatorAmountInput';

export interface CompactAmountInputProps {
  value: string;
  currency: string;
  currencySymbol?: string;
  onChangeText: (value: string) => void;
  precision?: number;
  placeholder?: string;
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
  testID?: string;
}

export function CompactAmountInput({
  value,
  currency,
  currencySymbol,
  onChangeText,
  precision = 2,
  placeholder = '0.00',
  label,
  containerStyle,
  inputStyle,
  testID,
}: CompactAmountInputProps) {
  const { theme } = useTheme();
  const normalizedCurrency = currency.trim().toUpperCase();
  const resolvedCurrencySymbol =
    currencySymbol || CURRENCY_SYMBOLS[normalizedCurrency] || currency || '$';

  return (
    <View
      style={[
        styles.wrapper,
        label && styles.wrapperWithLabel,
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
          style={styles.label}
        >
          {label}
        </AppText>
      )}
      <View style={styles.inputRow}>
        <AppText
          variant="caption"
          weight="bold"
          style={[styles.currencyPrefix, { color: theme.textTertiary }]}
        >
          {resolvedCurrencySymbol}
        </AppText>
        <CalculatorAmountInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          currencySymbol={resolvedCurrencySymbol}
          precision={precision}
          variant="minimal"
          containerStyle={styles.inputContainer}
          inputStyle={[styles.amountInput, inputStyle]}
          testID={testID}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: Size.controlCompact,
    borderRadius: Shape.radius.lg,
    borderWidth: 1,
  },
  wrapperWithLabel: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    height: 'auto',
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  label: {
    flexShrink: 1,
    paddingHorizontal: Spacing.md,
  },
  inputRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.none,
  },
  currencyPrefix: {
    fontSize: Typography.sizes.xs,
    marginRight: Spacing.xs,
  },
  inputContainer: {
    flex: 1,
    minHeight: 0,
  },
  amountInput: {
    height: 28,
    minHeight: 0,
    textAlign: 'right',
    flex: 1,
    paddingVertical: 0,
    paddingRight: Spacing.sm,
  },
});
