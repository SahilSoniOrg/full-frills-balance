import { AmountCalculatorSheet } from '@/src/components/common/AmountCalculatorSheet';
import { AppInput } from '@/src/components/core/AppInput';
import { Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

interface CalculatorAmountInputProps {
  value: string;
  onChangeText: (value: string) => void;
  currencySymbol?: string;
  precision?: number;
  placeholder?: string;
  label?: string;
  variant?: 'default' | 'hero' | 'minimal';
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
        containerStyle={isHero ? styles.heroInput : undefined}
        inputStyle={
          isHero
            ? {
                color: theme.text,
                fontFamily: fonts.semibold,
                fontSize: Typography.sizes.hero / 1.5,
                letterSpacing: -1,
                minWidth: 150,
                textAlign: 'center',
              }
            : undefined
        }
        calculator
        onCalculatorPress={() => setVisible(true)}
        testID={testID}
      />
      <AmountCalculatorSheet
        visible={visible}
        initialAmount={value}
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
    width: 'auto',
    minWidth: 210,
  },
});
