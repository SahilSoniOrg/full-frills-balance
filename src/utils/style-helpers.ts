import { Theme } from '@/src/constants/design-tokens';

export type ComponentVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'success'
  | 'warning'
  | 'error'
  | 'asset'
  | 'liability'
  | 'equity'
  | 'income'
  | 'expense'
  | 'text';

export interface VariantColors {
  main: string;
  light: string;
  contrast: string;
}

/**
 * Centralized mapping of component variants to theme colors.
 * Used to ensure consistency across AppText, Badge, AppButton, etc.
 */
export const getVariantColors = (
  theme: Theme,
  onContrast: (bg: string) => string,
  variant: ComponentVariant,
): VariantColors => {
  // Helper to resolve contrast tokens
  const resolveContrast = (bg: string) => onContrast(bg);

  switch (variant) {
    case 'primary':
      return {
        main: theme.primary,
        light: theme.primaryLight,
        contrast: theme.onPrimary,
      };
    case 'secondary':
      return {
        main: theme.textSecondary,
        light: theme.surfaceSecondary,
        contrast: theme.text,
      };
    case 'tertiary':
      return {
        main: theme.textTertiary,
        light: theme.surfaceSecondary,
        contrast: theme.text,
      };
    case 'success':
    case 'equity':
    case 'income':
      return {
        main: theme.success,
        light: theme.successLight,
        contrast: resolveContrast(theme.success),
      };
    case 'warning':
    case 'liability':
      return {
        main: theme.warning,
        light: theme.warningLight,
        contrast: resolveContrast(theme.warning),
      };
    case 'error':
    case 'expense':
      return {
        main: theme.error,
        light: theme.errorLight,
        contrast: resolveContrast(theme.error),
      };
    case 'asset':
      return {
        main: theme.asset,
        light: theme.assetLight,
        contrast: resolveContrast(theme.asset),
      };
    case 'text':
    case 'default':
    default:
      return {
        main: theme.text,
        light: theme.surfaceSecondary,
        contrast: theme.textSecondary,
      };
  }
};
