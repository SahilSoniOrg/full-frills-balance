import { AppConfig } from '@/constants';
import { preferences } from './preferences';

/**
 * Formatting options for CurrencyFormatter
 */
export interface CurrencyFormatOptions {
    includeSymbol?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
}

/**
 * CurrencyFormatter - Centralized utility for formatting currency amounts.
 */
export const CurrencyFormatter = {
    /**
     * Formats an amount with a specific currency code.
     */
    formatAmount(
        amount: number,
        currencyCode: string,
        options: CurrencyFormatOptions = {}
    ): string {
        const {
            includeSymbol = true,
            minimumFractionDigits = 2,
            maximumFractionDigits = 2
        } = options;

        try {
            return amount.toLocaleString(undefined, {
                style: includeSymbol ? 'currency' : 'decimal',
                currency: currencyCode,
                minimumFractionDigits,
                maximumFractionDigits,
            });
        } catch {
            // Fallback if currency code is invalid or not supported
            return `${amount.toFixed(maximumFractionDigits)} ${currencyCode}`;
        }
    },

    /**
     * Formats an amount using the user's default currency preference.
     */
    formatWithPreference(amount: number, options?: CurrencyFormatOptions): string {
        const defaultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
        return this.formatAmount(amount, defaultCurrency, options);
    },

    /**
     * Formats an amount with a fallback to the user's preference if currencyCode is missing.
     */
    format(amount: number, currencyCode?: string, options?: CurrencyFormatOptions): string {
        const code = currencyCode || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
        return this.formatAmount(amount, code, options);
    }
};
