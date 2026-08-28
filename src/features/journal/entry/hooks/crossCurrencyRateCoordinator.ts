import { fetchCrossCurrencyRates } from '@/src/services/currency/crossCurrencyRates';
import { sanitizeAmount } from '@/src/utils/validation';

export type CrossCurrencyRateFetcher = (
  fromCurrency: string,
  toCurrency: string,
  forceRefresh?: boolean,
) => Promise<number>;

export async function resolveCrossCurrencyRate(
  sourceCurrency: string,
  destinationCurrency: string,
  workplaceCurrency: string,
  fetchRate: CrossCurrencyRateFetcher,
) {
  return fetchCrossCurrencyRates(sourceCurrency, destinationCurrency, workplaceCurrency, fetchRate);
}

export function convertCrossCurrencyAmount(amount: string, exchangeRate: number): number {
  return sanitizeAmount((parseFloat(amount) || 0) * exchangeRate) || 0;
}
