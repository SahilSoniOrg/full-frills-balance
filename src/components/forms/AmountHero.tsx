import { AppIcon, AppText, Icon } from '@/src/components/core';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { formPrimitivesStrings as copy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import { Pressable, View } from 'react-native';

export interface AmountHeroProps {
  value: string;
  onChange: (text: string) => void;
  label?: string;
  currencySymbol?: string;
  precision?: number;
  currencyCode?: string;
  onCurrencyPress?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
  testID?: string;
}

export function AmountHero({
  value,
  onChange,
  label,
  currencySymbol = '',
  precision = 2,
  currencyCode,
  onCurrencyPress,
  autoFocus,
  placeholder,
  testID = 'hero-amount-input',
}: AmountHeroProps) {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      {label ? (
        <AppText
          variant="caption"
          weight="semibold"
          color="secondary"
          style={{ marginBottom: Spacing.xs, letterSpacing: Typography.letterSpacing.wide }}
        >
          {label}
        </AppText>
      ) : null}
      <CalculatorAmountInput
        value={value}
        onChangeText={onChange}
        currencySymbol={currencySymbol}
        precision={precision}
        placeholder={placeholder}
        variant="hero"
        autoFocus={autoFocus}
        testID={testID}
        containerStyle={{ width: '100%', paddingHorizontal: 0 }}
        inputStyle={{ fontFamily: Typography.fonts.heading }}
      />
      {currencyCode ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.currencyAccessibility(currencyCode)}
          onPress={onCurrencyPress}
          disabled={!onCurrencyPress}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.xs,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: Size.touchTarget,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.xs,
          }}
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
