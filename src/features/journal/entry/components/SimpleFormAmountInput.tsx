import { AppText } from '@/src/components/core/AppText';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

interface SimpleFormAmountInputProps {
  amount: string;
  setAmount?: (amount: string) => void;
  activeColor: string;
  displayCurrency: string;
  sectionLabelColor?: string;
  readOnly?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
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
  variant = 'default',
}: SimpleFormAmountInputProps) {
  const { theme, fonts } = useTheme();
  const resolvedActiveColor = resolveThemeColor(theme, activeColor);

  const isHero = variant === 'hero';

  return (
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
            style={{ color: resolvedActiveColor, textAlign: 'right' }}
            numberOfLines={1}
          >
            {amount || '0'}
          </AppText>
        </View>
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
});
