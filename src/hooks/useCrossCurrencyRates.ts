import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import {
  fetchCrossCurrencyRates,
  type CrossCurrencyRates,
} from '@/src/services/currency/crossCurrencyRates';
import {
  fxOverrideKey,
  RATE_UNAVAILABLE,
  type FxFetchedRates,
} from '@/src/domain/accounting/fxPair';
import { getHistoricalFxTimestamp } from '@/src/domain/accounting/journalFx';
import { logger } from '@/src/utils/logger';
import { useEffect, useMemo, useRef, useState } from 'react';

interface RateFetchers {
  fetchRequiredRate: (fromCurrency: string, toCurrency: string) => Promise<number | null>;
  fetchHistoricalRate?: (
    fromCurrency: string,
    toCurrency: string,
    transactionDate: number,
  ) => Promise<{ rate: number | null }>;
}

interface CurrencyPairRequest {
  sourceCurrency?: string;
  destCurrency?: string;
  baseCurrency: string;
  /** `YYYY-MM-DD`; the historical rate for this day is used when available. */
  journalDate?: string;
}

const IDLE_RATES: FxFetchedRates = {
  sourceBaseRate: null,
  destBaseRate: null,
  isLoading: false,
  error: null,
};
const LOADING_RATES: FxFetchedRates = { ...IDLE_RATES, isLoading: true };
const UNAVAILABLE_RATES: FxFetchedRates = { ...IDLE_RATES, error: RATE_UNAVAILABLE };

export function currencyPairKey(sourceCurrency?: string, destCurrency?: string): string {
  return `${sourceCurrency ?? ''}>${destCurrency ?? ''}`;
}

function pairNeedsFetch({ sourceCurrency, destCurrency, baseCurrency }: CurrencyPairRequest) {
  return Boolean(
    sourceCurrency &&
    destCurrency &&
    !(sourceCurrency === destCurrency && sourceCurrency === baseCurrency),
  );
}

function fetchPairBaseRates(
  {
    sourceCurrency,
    destCurrency,
    baseCurrency,
    journalDate,
  }: Required<Pick<CurrencyPairRequest, 'sourceCurrency' | 'destCurrency'>> & CurrencyPairRequest,
  { fetchRequiredRate, fetchHistoricalRate }: RateFetchers,
): Promise<CrossCurrencyRates | null> {
  let fetchRate: (fromCurrency: string, toCurrency: string) => Promise<number | null>;
  if (journalDate !== undefined) {
    const historicalTimestamp = getHistoricalFxTimestamp(journalDate);
    if (historicalTimestamp === undefined || !fetchHistoricalRate) return Promise.resolve(null);
    fetchRate = async (fromCurrency, toCurrency) =>
      (await fetchHistoricalRate(fromCurrency, toCurrency, historicalTimestamp)).rate;
  } else {
    fetchRate = (fromCurrency, toCurrency) => fetchRequiredRate(fromCurrency, toCurrency);
  }
  return fetchCrossCurrencyRates(sourceCurrency, destCurrency, baseCurrency, fetchRate);
}

export async function fetchPairRates(
  request: CurrencyPairRequest,
  fetchers: RateFetchers,
): Promise<FxFetchedRates> {
  const { sourceCurrency, destCurrency } = request;
  if (!sourceCurrency || !destCurrency || !pairNeedsFetch(request)) return IDLE_RATES;
  try {
    const rates = await fetchPairBaseRates({ ...request, sourceCurrency, destCurrency }, fetchers);
    return rates
      ? {
          sourceBaseRate: rates.sourceBaseRate,
          destBaseRate: rates.destBaseRate,
          isLoading: false,
          error: null,
        }
      : UNAVAILABLE_RATES;
  } catch (error) {
    logger.error('Failed to fetch rate', { sourceCurrency, destCurrency, error });
    return UNAVAILABLE_RATES;
  }
}

export interface UseCrossCurrencyRatesParams {
  sourceCurrency?: string;
  destCurrency?: string;
  workplaceCurrency: string;
  journalDate?: string;
  refreshNonce?: number;
  /** When false, no fetch runs and the pair reports idle. */
  enabled: boolean;
}

export function useCrossCurrencyRates({
  sourceCurrency,
  destCurrency,
  workplaceCurrency,
  journalDate,
  refreshNonce = 0,
  enabled,
}: UseCrossCurrencyRatesParams): FxFetchedRates {
  const { fetchRequiredRate, fetchHistoricalRate } = useExchangeRate();
  const [results, setResults] = useState<Record<string, FxFetchedRates>>({});
  const requestedRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  const pairKey = currencyPairKey(sourceCurrency, destCurrency);
  const contextKey = fxOverrideKey(workplaceCurrency, journalDate, refreshNonce);
  const requestKey = `${contextKey}#${pairKey}`;
  const shouldFetch =
    enabled && pairNeedsFetch({ sourceCurrency, destCurrency, baseCurrency: workplaceCurrency });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!shouldFetch) return;
    if (requestedRef.current.has(requestKey)) return;
    requestedRef.current.add(requestKey);
    void fetchPairRates(
      { sourceCurrency, destCurrency, baseCurrency: workplaceCurrency, journalDate },
      { fetchRequiredRate, fetchHistoricalRate },
    ).then(rates => {
      if (!mountedRef.current) return;
      setResults(previous => ({ ...previous, [requestKey]: rates }));
    });
  }, [
    fetchHistoricalRate,
    fetchRequiredRate,
    journalDate,
    requestKey,
    shouldFetch,
    sourceCurrency,
    destCurrency,
    workplaceCurrency,
  ]);

  return useMemo(() => {
    if (!shouldFetch) return IDLE_RATES;
    return results[requestKey] ?? LOADING_RATES;
  }, [requestKey, results, shouldFetch]);
}
