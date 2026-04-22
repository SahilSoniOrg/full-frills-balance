import { AppInput } from '@/src/components/core/AppInput';
import { Spacing, Typography } from '@/src/constants';
import { Box } from '@/src/design-system/Box';
import { useTheme } from '@/src/hooks/use-theme';
import React, { ReactNode } from 'react';
import { HeroNumberInput } from './HeroNumberInput';
import { SectionLabel } from './SectionLabel';

interface FormHeroSectionProps {
  nameValue: string;
  onNameChange: (text: string) => void;
  amountValue: string;
  onAmountChange: (text: string) => void;
  namePlaceholder?: string;
  amountPlaceholder?: string;
  nameLabel?: string;
  amountLabel?: string;
  footer?: ReactNode;
}

/**
 * Unified top section for creation forms (Budget, Planned Payments).
 * Groups Name and Amount inputs with standard hero hierarchy.
 */
export const FormHeroSection = ({
  nameValue,
  onNameChange,
  amountValue,
  onAmountChange,
  namePlaceholder = 'e.g., Groceries',
  amountPlaceholder = '0.00',
  nameLabel = 'Name',
  amountLabel = 'Amount',
  footer,
}: FormHeroSectionProps) => {
  const { theme, fonts } = useTheme();

  return (
    <Box padding="xl" alignItems="center" background="transparent">
      <SectionLabel
        label={nameLabel}
        marginTop="none"
        style={{ marginBottom: Spacing.xs, letterSpacing: 1 }}
      />
      <AppInput
        placeholder={namePlaceholder}
        value={nameValue}
        onChangeText={onNameChange}
        variant="minimal"
        inputStyle={{
          textAlign: 'center',
          fontSize: Typography.sizes.xl,
          fontFamily: fonts.medium,
          color: theme.text,
          letterSpacing: -0.5,
        }}
        containerStyle={{ marginBottom: Spacing.lg }}
      />

      <SectionLabel
        label={amountLabel}
        marginTop="none"
        style={{ marginBottom: Spacing.xs, letterSpacing: 1 }}
      />
      <HeroNumberInput
        value={amountValue}
        onChangeText={onAmountChange}
        placeholder={amountPlaceholder}
      />

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
