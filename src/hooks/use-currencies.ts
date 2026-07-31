import Currency from '@/src/data/models/Currency';
import { useObservable } from '@/src/hooks/useObservable';
import { currencyInitService } from '@/src/services/currency-init-service';
import { currencyReadService } from '@/src/services/currency-read-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { logger } from '@/src/utils/logger';
import { useEffect, useMemo } from 'react';

/**
 * Hook to reactively get all available currencies
 */
export function useCurrencies() {
  const { data: currencies, isLoading } = useObservable(
    () => currencyReadService.observeAll(),
    [],
    [] as Currency[],
  );

  useEffect(() => {
    currencyInitService.initialize().catch(error => {
      logger.warn('[useCurrencies] Failed to initialize currencies', { error });
    });
  }, []);

  return { currencies, isLoading };
}

/**
 * Hook to get the precision for a specific currency code reactively
 */
export function useCurrencyPrecision(code: string | undefined) {
  const { currencies, isLoading } = useCurrencies();

  const precision = useMemo(() => {
    if (!code) return 2;
    const currency = currencies.find(c => c.code === code);
    if (currency) return currency.precision;

    return CurrencyFormatter.getPrecisionFallback(code);
  }, [currencies, code]);

  return { precision, isLoading };
}
