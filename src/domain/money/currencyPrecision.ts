import { CURRENCY_PRECISIONS } from '@/src/constants/currency-definitions';

export const DEFAULT_CURRENCY_CODE = 'USD' as const;
export const DEFAULT_CURRENCY_PRECISION = 2;

export function normalizeCurrencyCode(code: string | undefined): string {
  return code?.trim().toUpperCase() ?? '';
}

export function getCurrencyPrecision(currencyCode: string | undefined): number {
  return CURRENCY_PRECISIONS[normalizeCurrencyCode(currencyCode)] ?? DEFAULT_CURRENCY_PRECISION;
}
