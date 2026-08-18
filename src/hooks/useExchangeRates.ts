import { currencyReadService } from '@/src/services/currency-read-service';
import { useObservable } from '@/src/hooks/useObservable';
import { PlainExchangeRate } from '@/src/types/domain';
import { useMemo } from 'react';
import { of } from 'rxjs';

/**
 * Hook to reactively observe exchange rates for a base currency
 */
export function useExchangeRates(baseCurrency: string | undefined) {
  const { data: rates, isLoading } = useObservable<PlainExchangeRate[]>(
    () => (baseCurrency ? currencyReadService.observeLatestRates(baseCurrency) : of([])),
    [baseCurrency],
    [],
  );

  const rateMap = useMemo(() => {
    const map: Record<string, number> = { [baseCurrency || '']: 1.0 };
    rates.forEach(r => {
      if (map[r.toCurrency] === undefined) {
        map[r.toCurrency] = r.rate;
      }
    });
    return map;
  }, [rates, baseCurrency]);

  return { rateMap, isLoading };
}
