import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { useCallback } from 'react';

export function useExchangeRate() {
  const fetchRate = useCallback(
    async (fromCurrency: string, toCurrency: string, forceRefresh: boolean = false) => {
      return exchangeRateService.getRate(fromCurrency, toCurrency, forceRefresh);
    },
    [],
  );

  return { fetchRate };
}
