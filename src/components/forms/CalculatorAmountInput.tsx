import { AmountCalculatorSheet } from '@/src/components/overlays/AmountCalculatorSheet';
import { AppInput } from '@/src/components/core/AppInput';
import { Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { StyleProp, StyleSheet, TextInputProps, ViewStyle } from 'react-native';

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
  precision?: number;
  placeholder?: string;
  label?: string;
  variant?: 'default' | 'hero' | 'minimal';
  inputStyle?: TextInputProps['style'];
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function CalculatorAmountInput({
  value,
  onChangeText,
  currencySymbol = '',
  precision = 2,
  placeholder = '0.00',
  label,
  variant = 'default',
  inputStyle,
  containerStyle,
  testID,
}: CalculatorAmountInputProps) {
  const { theme, fonts } = useTheme();
  const [visible, setVisible] = useState(false);
  const isHero = variant === 'hero';

  return (
    <>
      <AppInput
        label={label}
        value={value}
        placeholder={placeholder}
        variant={isHero ? 'minimal' : variant}
        containerStyle={[isHero && styles.heroInput, containerStyle]}
        inputStyle={[
          isHero && {
            color: theme.text,
            fontFamily: fonts.semibold,
            fontSize: getHeroAmountFontSize(value),
            letterSpacing: -1,
            minWidth: 0,
            flexShrink: 1,
            textAlign: 'center',
          },
          inputStyle,
        ]}
        calculator
        onCalculatorPress={() => setVisible(true)}
        calculatorTestID={testID ? `${testID}-calculator` : undefined}
        testID={testID}
      />
      <AmountCalculatorSheet
        visible={visible}
        currencySymbol={currencySymbol}
        precision={precision}
        onClose={() => setVisible(false)}
        onDone={amount => {
          onChangeText(amount);
          setVisible(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  heroInput: {
    width: '100%',
    minWidth: 0,
  },
});
