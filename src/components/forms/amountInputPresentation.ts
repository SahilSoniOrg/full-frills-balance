import { Size, Spacing, Typography } from '@/src/constants/design-tokens';

type AmountTypography = {
  amountFontSize: number;
  currencyFontSize: number;
  currencyLineHeight: number;
  inputHeight: number;
};

function tier(
  amountFontSize: number,
  currencyFontSize: number,
): AmountTypography {
  return {
    amountFontSize,
    currencyFontSize,
    currencyLineHeight: Math.round(currencyFontSize * Typography.lineHeights.tight),
    inputHeight: Math.max(Size.buttonMd, amountFontSize + Spacing.md),
  };
}

const AMOUNT_TYPOGRAPHY_TIERS: { minExclusive: number; typography: AmountTypography }[] = [
  { minExclusive: 11, typography: tier(Typography.sizes.xl, Typography.sizes.sm) },
  { minExclusive: 8, typography: tier(Typography.sizes.xxl, Typography.sizes.base) },
  { minExclusive: 6, typography: tier(Typography.sizes.xxxl, Typography.sizes.lg) },
];

const DEFAULT_AMOUNT_TYPOGRAPHY: AmountTypography = {
  amountFontSize: Typography.sizes.jumbo,
  currencyFontSize: Typography.sizes.xxl,
  currencyLineHeight: Math.round(Typography.sizes.xxl * Typography.lineHeights.tight),
  inputHeight: Typography.sizes.jumbo + Spacing.md,
};

export function resolveAmountTypography(amountLength: number): AmountTypography {
  for (const { minExclusive, typography } of AMOUNT_TYPOGRAPHY_TIERS) {
    if (amountLength > minExclusive) return typography;
  }
  return DEFAULT_AMOUNT_TYPOGRAPHY;
}
