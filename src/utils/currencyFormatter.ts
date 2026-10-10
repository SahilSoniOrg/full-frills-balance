import { AppConfig } from '@/src/constants';
import {
  CURRENCY_LOCALES,
  CURRENCY_PRECISIONS,
  CURRENCY_SYMBOLS,
} from '@/src/constants/currency-definitions';

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
const FORMAT_CACHE = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

/** Formatting locale configured on the currency definition (e.g. INR -> 'en-IN'), if any. */
export function getCurrencyLocale(currencyCode: string | undefined): string | undefined {
  return CURRENCY_LOCALES[normalizeCurrencyCode(currencyCode)];
}

export function normalizeCurrencyCode(currencyCode: string | undefined): string {
  return currencyCode?.trim().toUpperCase() ?? '';
}

/** Locale for short style when the currency has none; keeps K/M/B/T independent of device locale. */
const SHORT_DEFAULT_LOCALE = 'en-US';
const COMPACT_FORMATTERS = new Map<string, Intl.NumberFormat>();
const COMPACT_SUPPORT = new Map<string, boolean>();

function getCompactFormatter(locale: string): Intl.NumberFormat {
  let formatter = COMPACT_FORMATTERS.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    });
    COMPACT_FORMATTERS.set(locale, formatter);
  }
  return formatter;
}

/**
 * Hermes on iOS ignores `notation: 'compact'` (facebook/hermes#1035) and returns the full
 * number, so probe once per locale and use the fallback when compaction did not happen.
 */
function supportsCompactNotation(locale: string): boolean {
  let supported = COMPACT_SUPPORT.get(locale);
  if (supported === undefined) {
    try {
      supported = !/^1[,.\s\u00a0\u202f]?500/.test(getCompactFormatter(locale).format(1500));
    } catch {
      supported = false;
    }
    COMPACT_SUPPORT.set(locale, supported);
  }
  return supported;
}

/** Guarded fallback for engines without compact notation; mirrors en / en-IN CLDR short forms. */
function formatCompactFallback(amount: number, locale: string): string {
  const units: [number, string][] =
    locale === 'en-IN'
      ? [
          [1e7, 'Cr'],
          [1e5, 'L'],
          [1e3, 'K'],
        ]
      : [
          [1e12, 'T'],
          [1e9, 'B'],
          [1e6, 'M'],
          [1e3, 'K'],
        ];
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const [divisor, suffix] = units.find(([d]) => abs >= d) ?? units[units.length - 1];
  return `${sign}${(abs / divisor).toFixed(1).replace(/\.0$/, '')}${suffix}`;
}

export const CurrencyFormatter = {
  /**
   * Formats an amount with a specific currency code.
   */
  formatAmount(amount: number, currencyCode: string, options: CurrencyFormatOptions = {}): string {
    const locale = getCurrencyLocale(currencyCode);
    const cacheKey = `${amount}:${currencyCode}:${locale ?? ''}:${JSON.stringify(options)}`;
    if (FORMAT_CACHE.has(cacheKey)) return FORMAT_CACHE.get(cacheKey)!;

    const defaultPrecision = this.getPrecisionFallback(currencyCode);
    const {
      includeSymbol = true,
      minimumFractionDigits = defaultPrecision,
      maximumFractionDigits = defaultPrecision,
    } = options;

    try {
      // With an explicit currency locale, avoid a '-' on values that round to zero.
      if (locale && Number(amount.toFixed(maximumFractionDigits)) === 0) amount = 0;

      const formatted = amount.toLocaleString(locale, {
        style: includeSymbol ? 'currency' : 'decimal',
        currency: currencyCode,
        minimumFractionDigits,
        maximumFractionDigits,
      });

      let finalResult = formatted;

      // If we have a custom symbol and it's missing from the output or shown as code, force it
      const customSymbol = CURRENCY_SYMBOLS[currencyCode];
      if (includeSymbol && customSymbol) {
        // Check if the formatted string contains the code (indicating fallback occurred)
        const containsCode = new RegExp(`\\b${currencyCode}\\b`).test(formatted);
        const containsSymbol = formatted.includes(customSymbol);

        if (containsCode && !containsSymbol && currencyCode !== customSymbol) {
          const decimal = Math.abs(amount).toLocaleString(locale, {
            style: 'decimal',
            minimumFractionDigits,
            maximumFractionDigits,
          });
          const sign = amount < 0 ? '-' : '';
          finalResult = `${sign}${customSymbol}${decimal}`;
        } else if (!containsSymbol && !containsCode) {
          const decimal = Math.abs(amount).toLocaleString(locale, {
            style: 'decimal',
            minimumFractionDigits,
            maximumFractionDigits,
          });
          const sign = amount < 0 ? '-' : '';
          finalResult = `${sign}${customSymbol}${decimal}`;
        }
      }

      // Cache management
      if (FORMAT_CACHE.size >= MAX_CACHE_SIZE) {
        const firstKey = FORMAT_CACHE.keys().next().value;
        if (firstKey !== undefined) FORMAT_CACHE.delete(firstKey);
      }
      FORMAT_CACHE.set(cacheKey, finalResult);

      return finalResult;
    } catch {
      // Fallback logic
      const customSymbol = CURRENCY_SYMBOLS[currencyCode];
      const decimal = Math.abs(amount).toFixed(maximumFractionDigits);
      const sign = amount < 0 ? '-' : '';
      const finalResult = customSymbol
        ? `${sign}${customSymbol}${decimal}`
        : `${sign}${decimal} ${currencyCode}`;

      FORMAT_CACHE.set(cacheKey, finalResult);
      return finalResult;
    }
  },

  /**
   * Formats an amount with a fallback to the application default if currencyCode is missing.
   */
  format(amount: number, currencyCode: string, options?: CurrencyFormatOptions): string {
    const code = currencyCode;
    return this.formatAmount(amount, code, options);
  },

  /**
   * Formats an amount in short form (e.g. 1.5K, 2.5M, 1.5L, 9.9Cr) using Intl compact notation
   * in the currency's locale (INR -> en-IN gives lakh/crore). No currency symbol at >= 1000;
   * below that it falls back to the whole-number currency format.
   */
  formatShort(amount: number, currencyCode: string): string {
    if (Math.abs(amount) < 1000) {
      return this.format(amount, currencyCode, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    }
    const locale = getCurrencyLocale(currencyCode) ?? SHORT_DEFAULT_LOCALE;
    if (supportsCompactNotation(locale)) {
      return getCompactFormatter(locale).format(amount);
    }
    return formatCompactFallback(amount, locale);
  },

  /**
   * Gets the fallback precision (decimal places) for a currency code.
   * Uses CURRENCY_PRECISIONS mapping and falls back to 2.
   */
  getPrecisionFallback(currencyCode: string | undefined): number {
    const normalizedCode = normalizeCurrencyCode(currencyCode);
    if (!normalizedCode) return 2;
    return CURRENCY_PRECISIONS[normalizedCode] ?? 2;
  },
};

export const FORMAT_AMOUNT_LOADING = '---';

/**
 * Display styles for money amounts. `sts` = Safe-to-Spend (<0.5 thresholds).
 * `trimmed` drops the fraction only when the amount is whole at the currency's precision.
 */
export type MoneyFormatStyle = 'default' | 'short' | 'compact' | 'sts' | 'trimmed';

export type FormatMoneyOptions = {
  style?: MoneyFormatStyle;
  loading?: boolean;
  /** Sign chrome (+/-). Masked together with the amount in privacy mode. */
  prefix?: string;
};

/**
 * Safe-to-spend amount formatting with small-value handling (< 0.5).
 * Prefer formatMoneyAmount / useMoneyFormat so privacy is applied at the call site.
 */
export function formatStsAmount(raw: number, currency: string): string {
  const isVerySmall = Math.abs(raw) > 0 && Math.abs(raw) < 0.5;
  if (isVerySmall) {
    const oneFormatted = CurrencyFormatter.format(1, currency, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return raw > 0 ? `< ${oneFormatted}` : `> -${oneFormatted}`;
  }

  return CurrencyFormatter.format(raw, currency, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Privacy-aware number→string. Use from hooks, tests, and non-React surfaces (alerts). */
export function formatMoneyAmount(
  amount: number,
  currencyCode: string,
  isPrivacyMode: boolean,
  options: FormatMoneyOptions = {},
): string {
  const { loading = false, style = 'default', prefix = '' } = options;
  if (loading) return FORMAT_AMOUNT_LOADING;
  if (isPrivacyMode) return AppConfig.privacyMask;

  let formatted: string;
  switch (style) {
    case 'short':
      formatted = CurrencyFormatter.formatShort(amount, currencyCode);
      break;
    case 'compact':
      formatted = CurrencyFormatter.format(amount, currencyCode, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      break;
    case 'sts':
      formatted = formatStsAmount(amount, currencyCode);
      break;
    case 'trimmed': {
      const factor = 10 ** CurrencyFormatter.getPrecisionFallback(currencyCode);
      formatted =
        Math.round(amount * factor) % factor === 0
          ? CurrencyFormatter.format(amount, currencyCode, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })
          : CurrencyFormatter.format(amount, currencyCode);
      break;
    }
    default:
      formatted = CurrencyFormatter.format(amount, currencyCode);
  }
  return prefix ? `${prefix}${formatted}` : formatted;
}
