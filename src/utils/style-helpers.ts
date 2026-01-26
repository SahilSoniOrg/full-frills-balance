import { getContrastColor, Theme } from '@/constants';

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
export const getVariantColors = (theme: Theme, variant: ComponentVariant): VariantColors => {
    switch (variant) {
        case 'primary':
            return {
                main: theme.primary,
                light: theme.primaryLight,
                contrast: theme.pureInverse,
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
                contrast: getContrastColor(theme.success),
            };
        case 'warning':
        case 'liability':
            return {
                main: theme.warning,
                light: theme.warningLight,
                contrast: getContrastColor(theme.warning),
            };
        case 'error':
        case 'expense':
            return {
                main: theme.error,
                light: theme.errorLight,
                contrast: getContrastColor(theme.error),
            };
        case 'asset':
            return {
                main: theme.asset,
                light: theme.primaryLight,
                contrast: getContrastColor(theme.asset),
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
