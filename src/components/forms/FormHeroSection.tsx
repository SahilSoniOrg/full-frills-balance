import { Spacing } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import type { ReactNode } from 'react';
import { SectionLabel } from '@/src/components/shared/SectionLabel';
import { AmountHero } from './AmountHero';
import { FormHeroNameFieldAlignment, UnderlineNameField } from './UnderlineNameField';

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
          <FormHeroNameFieldAlignment align={nameAlign}>
            <UnderlineNameField
              placeholder={namePlaceholder}
              value={nameValue}
              onChangeText={onNameChange}
              testID="hero-name-input"
            />
          </FormHeroNameFieldAlignment>
        </Box>
      </Inline>

      {showAmount && (
        <AmountHero
          value={amountValue}
          onChange={onAmountChange}
          label={amountLabel}
          placeholder={amountPlaceholder}
          currencySymbol={currencySymbol}
          precision={precision}
          testID="hero-amount-input"
        />
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
