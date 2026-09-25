import { AppConfig } from '@/src/constants/app-config';
import { CURRENCY_PRECISIONS } from '@/src/constants/currency-definitions';

export function getCurrencyPrecision(currencyCode: string): number {
  return CURRENCY_PRECISIONS[currencyCode.trim().toUpperCase()] ?? AppConfig.constants.precision;
}
