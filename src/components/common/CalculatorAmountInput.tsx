import { AppIcon, AppText } from '@/src/components/core';
import { AmountCalculatorSheet } from '@/src/components/common/AmountCalculatorSheet';
import { Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface CalculatorAmountInputProps {
  value: string;
  onChangeText: (value: string) => void;
  currencySymbol?: string;
  precision?: number;
  placeholder?: string;
  label?: string;
  variant?: 'default' | 'hero';
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
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const isHero = variant === 'hero';

  return (
    <>
      <View style={isHero ? styles.heroContainer : undefined}>
        {label && !isHero && (
          <AppText variant="caption" color="secondary" style={styles.label}>
            {label}
          </AppText>
        )}
        <TouchableOpacity
          onPress={() => setVisible(true)}
          style={[
            styles.input,
            isHero ? styles.heroInput : styles.defaultInput,
            { backgroundColor: isHero ? 'transparent' : theme.surfaceSecondary },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${label || 'Amount'} ${value || placeholder}`}
          testID={testID}
        >
          <AppText
            variant={isHero ? 'hero' : 'title'}
            weight="bold"
            numberOfLines={1}
            style={{ color: value ? theme.text : theme.textTertiary, flex: 1 }}
          >
            {value || placeholder}
          </AppText>
          <AppIcon name="calculator" size={Size.iconSm} color={theme.primary} />
        </TouchableOpacity>
      </View>
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
  heroContainer: {
    width: '100%',
    alignItems: 'center',
  },
  label: {
    marginBottom: Spacing.xs,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Shape.radius.r3,
    width: '100%',
  },
  defaultInput: {
    minHeight: Size.inputLg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  heroInput: {
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    borderBottomWidth: 1,
  },
});
