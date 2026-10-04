import { Size, Spacing, Typography } from '@/src/constants/design-tokens';

export function resolveAmountTypography(amountLength: number): {
  amountFontSize: number;
  currencyFontSize: number;
  currencyLineHeight: number;
  inputHeight: number;
} {
  if (amountLength > 11) {
    return {
      amountFontSize: Typography.sizes.xl,
      currencyFontSize: Typography.sizes.sm,
      currencyLineHeight: Math.round(Typography.sizes.sm * Typography.lineHeights.tight),
      inputHeight: Math.max(Size.buttonMd, Typography.sizes.xl + Spacing.md),
    };
  }
  if (amountLength > 8) {
    return {
      amountFontSize: Typography.sizes.xxl,
      currencyFontSize: Typography.sizes.base,
      currencyLineHeight: Math.round(Typography.sizes.base * Typography.lineHeights.tight),
      inputHeight: Math.max(Size.buttonMd, Typography.sizes.xxl + Spacing.md),
    };
  }
  if (amountLength > 6) {
    return {
      amountFontSize: Typography.sizes.xxxl,
      currencyFontSize: Typography.sizes.lg,
      currencyLineHeight: Math.round(Typography.sizes.lg * Typography.lineHeights.tight),
      inputHeight: Math.max(Size.buttonMd, Typography.sizes.xxxl + Spacing.md),
    };
  }
  return {
    amountFontSize: Typography.sizes.jumbo,
    currencyFontSize: Typography.sizes.xxl,
    currencyLineHeight: Math.round(Typography.sizes.xxl * Typography.lineHeights.tight),
    inputHeight: Typography.sizes.jumbo + Spacing.md,
  };
}
