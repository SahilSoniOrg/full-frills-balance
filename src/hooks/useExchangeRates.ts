import ExchangeRate from '@/src/data/models/ExchangeRate';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { useObservable } from '@/src/hooks/useObservable';
import { useMemo } from 'react';
import { of } from 'rxjs';

/**
 * Hook to reactively observe exchange rates for a base currency
 */
export function useExchangeRates(baseCurrency: string | undefined) {
    const { data: rates, isLoading } = useObservable<ExchangeRate[]>(
        () => baseCurrency ? exchangeRateRepository.observeLatestRates(baseCurrency) : of([]),
        [baseCurrency],
        []
    );

    // Map to a simpler Record for synchronous lookup
    const rateMap = useMemo(() => {
        const map: Record<string, number> = { [baseCurrency || '']: 1.0 };
        rates.forEach(r => {
            // Since we sorted by date in repo, the first one encountered for a toCurrency is the latest
            if (map[r.toCurrency] === undefined) {
                map[r.toCurrency] = r.rate;
            }
        });
        return map;
    }, [rates, baseCurrency]);

    return { rateMap, isLoading };
}
