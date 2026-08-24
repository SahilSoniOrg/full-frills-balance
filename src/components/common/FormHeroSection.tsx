import { AppInput } from '@/src/components/core/AppInput';
import { CalculatorAmountInput } from '@/src/components/common/CalculatorAmountInput';
import { Spacing, Typography } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { ReactNode } from 'react';
import { SectionLabel } from './SectionLabel';

interface FormHeroSectionProps {
  nameValue: string;
  onNameChange: (text: string) => void;
  amountValue?: string;
  onAmountChange?: (text: string) => void;
  namePlaceholder?: string;
  amountPlaceholder?: string;
  nameLabel?: string;
  amountLabel?: string;
  footer?: ReactNode;
  prefix?: ReactNode;
  nameAlign?: 'left' | 'center';
  showAmount?: boolean;
  currencySymbol?: string;
  precision?: number;
}

/**
 * Unified top section for creation forms (Budget, Planned Payments).
 * Groups Name and Amount inputs with standard hero hierarchy.
 */
export const FormHeroSection = ({
  nameValue,
  onNameChange,
  amountValue = '',
  onAmountChange = () => {},
  namePlaceholder = 'e.g., Groceries',
  amountPlaceholder = '0.00',
  nameLabel = 'Name',
  amountLabel = 'Amount',
  footer,
  prefix,
  nameAlign = 'center',
  showAmount = true,
  currencySymbol = '$',
  precision = 2,
}: FormHeroSectionProps) => {
  const { theme, fonts } = useTheme();

  return (
    <Box padding="xl" alignItems="center" background="transparent">
      <SectionLabel
        label={nameLabel}
        marginTop="none"
        style={{ marginBottom: Spacing.xs, letterSpacing: 1 }}
      />
      <Inline align="center" space="md" style={{ marginBottom: Spacing.lg, width: '100%' }}>
        {prefix && <Box>{prefix}</Box>}
        <Box flex={1}>
          <AppInput
            placeholder={namePlaceholder}
            value={nameValue}
            onChangeText={onNameChange}
            variant="minimal"
            testID="hero-name-input"
            inputStyle={{
              textAlign: nameAlign,
              fontSize: Typography.sizes.xl,
              fontFamily: fonts.medium,
              color: theme.text,
              letterSpacing: -0.5,
            }}
            containerStyle={{ marginBottom: 0 }}
          />
        </Box>
      </Inline>

      {showAmount && (
        <>
          <SectionLabel
            label={amountLabel}
            marginTop="none"
            style={{ marginBottom: Spacing.xs, letterSpacing: 1 }}
          />
          <CalculatorAmountInput
            value={amountValue}
            onChangeText={onAmountChange}
            placeholder={amountPlaceholder}
            currencySymbol={currencySymbol}
            precision={precision}
            variant="hero"
            testID="hero-amount-input"
          />
        </>
      )}

      {footer && <Box marginTop="md">{footer}</Box>}

      <Box
        height={1}
        width="80%"
        background="divider"
        marginTop="md"
        opacity={0.3}
        alignSelf="center"
      />
    </Box>
  );
};
