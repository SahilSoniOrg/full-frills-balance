import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { useCallback } from 'react';

export function useExchangeRate() {
  const fetchRate = useCallback(
    async (fromCurrency: string, toCurrency: string, forceRefresh: boolean = false) => {
      return exchangeRateService.getRate(fromCurrency, toCurrency, forceRefresh);
    },
    [],
  );

  const fetchRequiredRate = useCallback(
    async (fromCurrency: string, toCurrency: string, forceRefresh: boolean = false) => {
      return exchangeRateService.getRequiredRate(fromCurrency, toCurrency, forceRefresh);
    },
    [],
  );

  const fetchHistoricalRate = useCallback(
    async (fromCurrency: string, toCurrency: string, transactionDate: number) => {
      return exchangeRateService.getHistoricalRate(fromCurrency, toCurrency, transactionDate);
    },
    [],
  );

  return { fetchRate, fetchRequiredRate, fetchHistoricalRate };
}
