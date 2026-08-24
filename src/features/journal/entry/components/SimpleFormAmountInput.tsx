import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { AmountCalculatorSheet } from '@/src/components/common/AmountCalculatorSheet';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

interface SimpleFormAmountInputProps {
  amount: string;
  setAmount?: (amount: string) => void;
  activeColor: string;
  displayCurrency: string;
  sectionLabelColor?: string;
  readOnly?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  precision?: number;
  variant?: 'default' | 'hero';
}

export function SimpleFormAmountInput({
  amount,
  setAmount,
  activeColor,
  displayCurrency,
  readOnly,
  onFocus,
  onBlur,
  precision = 2,
  variant = 'default',
}: SimpleFormAmountInputProps) {
  const { theme, fonts } = useTheme();
  const resolvedActiveColor = resolveThemeColor(theme, activeColor);
  const [calculatorVisible, setCalculatorVisible] = useState(false);

  const isHero = variant === 'hero';

  return (
    <>
      <View
        style={[
          styles.amountRow,
          isHero ? styles.heroRow : { backgroundColor: theme.surfaceSecondary },
        ]}
      >
        <View style={styles.currencyWrap}>
          <AppText
            variant={isHero ? 'heading' : 'xl'}
            weight="bold"
            style={{ color: theme.textSecondary, opacity: Opacity.heavy }}
          >
            {CURRENCY_SYMBOLS[displayCurrency] || displayCurrency}
          </AppText>
        </View>
        {readOnly ? (
          <View style={styles.amountDisplay}>
            <AppText
              variant={isHero ? 'hero' : 'title'}
              weight="bold"
              style={[styles.calculatorValue, { color: resolvedActiveColor, textAlign: 'right' }]}
              numberOfLines={1}
            >
              {amount || '0'}
            </AppText>
          </View>
        ) : setAmount ? (
          <TouchableOpacity
            style={[styles.amountDisplay, styles.calculatorDisplay]}
            onPress={() => setCalculatorVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open amount calculator"
            testID="amount-input"
          >
            <AppText
              variant={isHero ? 'hero' : 'title'}
              weight="bold"
              style={[styles.calculatorValue, { color: resolvedActiveColor, textAlign: 'right' }]}
              numberOfLines={1}
            >
              {amount || '0'}
            </AppText>
            <AppIcon name="calculator" size={Size.iconSm} color={resolvedActiveColor} />
          </TouchableOpacity>
        ) : (
          <TextInput
            style={[
              styles.amountInput,
              {
                color: resolvedActiveColor,
                fontFamily: fonts.heading,
                fontSize: isHero ? Typography.sizes.jumbo : Typography.sizes.xxxl,
              },
            ]}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            autoFocus={isHero}
            numberOfLines={1}
            placeholder="0"
            placeholderTextColor={withOpacity(theme.textSecondary, Opacity.medium)}
            cursorColor={resolvedActiveColor}
            selectionColor={withOpacity(resolvedActiveColor || activeColor, Opacity.muted)}
            testID="amount-input"
            onFocus={onFocus}
            onBlur={onBlur}
          />
        )}
      </View>
      {!readOnly && setAmount && (
        <AmountCalculatorSheet
          visible={calculatorVisible}
          initialAmount={amount}
          currencySymbol={CURRENCY_SYMBOLS[displayCurrency] || displayCurrency}
          precision={precision}
          onClose={() => setCalculatorVisible(false)}
          onDone={value => {
            setAmount(value);
            setCalculatorVisible(false);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Shape.radius.r3,
    paddingHorizontal: Spacing.lg,
    minHeight: Size.inputLg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    width: '100%',
    overflow: 'hidden',
  },
  heroRow: {
    backgroundColor: 'transparent',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent', // Can be used for a subtle divider
  },
  currencyWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: Size.xl,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    maxWidth: '100%',
    flexShrink: 1,
    textAlign: 'right',
    writingDirection: 'auto',
    includeFontPadding: false,
  },
  amountDisplay: {
    flex: 1,
    justifyContent: 'center',
  },
  calculatorDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  calculatorValue: {
    flex: 1,
  },
});
