import { AppConfig } from '@/src/constants';
import { CURRENCY_PRECISIONS, CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { preferences } from '@/src/utils/preferences';

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
        const defaultPrecision = this.getPrecisionFallback(currencyCode);
        const {
            includeSymbol = true,
            minimumFractionDigits = defaultPrecision,
            maximumFractionDigits = defaultPrecision
        } = options;

        try {
            const formatted = amount.toLocaleString(undefined, {
                style: includeSymbol ? 'currency' : 'decimal',
                currency: currencyCode,
                minimumFractionDigits,
                maximumFractionDigits,
            });

            // If we have a custom symbol and it's missing from the output or shown as code, force it
            const customSymbol = CURRENCY_SYMBOLS[currencyCode];
            if (includeSymbol && customSymbol) {
                // Check if the formatted string contains the code (indicating fallback occurred)
                // We use a regex to handle cases like "-AMD 47.00" or "(AMD 47.00)"
                const containsCode = new RegExp(`\\b${currencyCode}\\b`).test(formatted);
                const containsSymbol = formatted.includes(customSymbol);

                if (containsCode && !containsSymbol && currencyCode !== customSymbol) {
                    // Reformat as decimal and apply symbol
                    const decimal = Math.abs(amount).toLocaleString(undefined, {
                        style: 'decimal',
                        minimumFractionDigits,
                        maximumFractionDigits,
                    });

                    const sign = amount < 0 ? '-' : '';
                    // Simple prefix logic - could be made locale-aware if needed
                    return `${sign}${customSymbol}${decimal}`;
                }

                // Also check if the symbol is completely missing but we expected one
                if (!containsSymbol && !containsCode) {
                    const decimal = Math.abs(amount).toLocaleString(undefined, {
                        style: 'decimal',
                        minimumFractionDigits,
                        maximumFractionDigits,
                    });
                    const sign = amount < 0 ? '-' : '';
                    return `${sign}${customSymbol}${decimal}`;
                }
            }

            return formatted;
        } catch {
            // Fallback if currency code is invalid or not supported
            const customSymbol = CURRENCY_SYMBOLS[currencyCode];
            const decimal = Math.abs(amount).toFixed(maximumFractionDigits);
            const sign = amount < 0 ? '-' : '';
            if (customSymbol) {
                return `${sign}${customSymbol}${decimal}`;
            }
            return `${sign}${decimal} ${currencyCode}`;
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
    },

    /**
     * Formats an amount in short form (e.g., 1K, 1M, 1L, 1Cr).
     */
    formatShort(amount: number, currencyCode?: string): string {
        const code = currencyCode || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
        const absAmount = Math.abs(amount);
        const sign = amount < 0 ? '-' : '';

        if (code === 'INR') {
            if (absAmount >= 10000000) { // 1 Crore
                return `${sign}${(absAmount / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`;
            }
            if (absAmount >= 100000) { // 1 Lakh
                return `${sign}${(absAmount / 100000).toFixed(1).replace(/\.0$/, '')}L`;
            }
            if (absAmount >= 1000) {
                return `${sign}${(absAmount / 1000).toFixed(1).replace(/\.0$/, '')}K`;
            }
        } else {
            if (absAmount >= 1000000000000) {
                return `${sign}${(absAmount / 1000000000000).toFixed(1).replace(/\.0$/, '')}T`;
            }
            if (absAmount >= 1000000000) {
                return `${sign}${(absAmount / 1000000000).toFixed(1).replace(/\.0$/, '')}B`;
            }
            if (absAmount >= 1000000) {
                return `${sign}${(absAmount / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
            }
            if (absAmount >= 1000) {
                return `${sign}${(absAmount / 1000).toFixed(1).replace(/\.0$/, '')}K`;
            }
        }


        return this.format(amount, code, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },

    /**
     * Gets the fallback precision (decimal places) for a currency code.
     * Uses CURRENCY_PRECISIONS mapping and falls back to 2.
     */
    getPrecisionFallback(currencyCode: string | undefined): number {
        if (!currencyCode) return 2;
        return CURRENCY_PRECISIONS[currencyCode.toUpperCase()] ?? 2;
    }
};
