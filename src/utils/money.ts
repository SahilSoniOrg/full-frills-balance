import { AppConfig } from '@/src/constants';
import * as Localization from 'expo-localization';

/**
 * Rounds a number to a specific precision (decimal places).
 * Essential for the "edge-rounding" strategy to prevent floating-point drift.
 */
export const roundToPrecision = (amount: number, precision: number): number => {
    const factor = Math.pow(10, precision);
    return Math.round((amount + Number.EPSILON) * factor) / factor;
};

/**
 * Returns dynamic epsilon for zero-balance checks based on precision.
 * e.g., for precision 2, epsilon is 0.001.
 */
export const getEpsilon = (precision: number): number => {
    return Math.pow(10, -(precision + 1));
};

/**
 * Compares two amounts for equality using rounding to specific precision.
 * This is more robust against accumulated floating-point noise than simple epsilon checks.
 */
export const amountsAreEqual = (a: number, b: number, precision: number): boolean => {
    return roundToPrecision(a, precision) === roundToPrecision(b, precision);
};

/**
 * Safe addition with immediate rounding.
 */
export const safeAdd = (a: number, b: number, precision: number): number => {
    return roundToPrecision(a + b, precision);
};

/**
 * Safe subtraction with immediate rounding.
 */
export const safeSubtract = (a: number, b: number, precision: number): number => {
    return roundToPrecision(a - b, precision);
};

/**
 * Formats a number as a currency string.
 * @param amount The value to format
 * @param currencyCode The ISO currency code
 * @param locale The locale to use
 */
export const formatCurrency = (
    amount: number,
    currencyCode: string = AppConfig.defaultCurrency,
    locale: string = Localization.getLocales()[0]?.languageTag || AppConfig.defaultLocale
): string => {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
    }).format(amount);
};
