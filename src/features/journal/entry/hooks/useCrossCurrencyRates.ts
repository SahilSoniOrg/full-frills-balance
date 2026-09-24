import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import {
  fetchCrossCurrencyRates,
  type CrossCurrencyRates,
} from '@/src/services/currency/crossCurrencyRates';
import {
  fxOverrideKey,
  RATE_UNAVAILABLE,
  type FxFetchedRates,
} from '@/src/features/journal/entry/fxPair';
import { logger } from '@/src/utils/logger';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface RateFetchers {
  fetchRequiredRate: (fromCurrency: string, toCurrency: string) => Promise<number | null>;
  fetchHistoricalRate?: (
    fromCurrency: string,
    toCurrency: string,
    transactionDate: number,
  ) => Promise<{ rate: number | null }>;
}

export interface CurrencyPairRequest {
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
  const historicalTimestamp = journalDate ? Date.parse(`${journalDate}T00:00:00.000Z`) : Number.NaN;
  const fetchRate =
    Number.isFinite(historicalTimestamp) && fetchHistoricalRate
      ? async (fromCurrency: string, toCurrency: string) =>
          (await fetchHistoricalRate(fromCurrency, toCurrency, historicalTimestamp)).rate
      : (fromCurrency: string, toCurrency: string) => fetchRequiredRate(fromCurrency, toCurrency);
  return fetchCrossCurrencyRates(sourceCurrency, destCurrency, baseCurrency, fetchRate);
}

/** Fetches market base rates for one pair; failures resolve to `Rate unavailable`. */
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

export interface UseCrossCurrencyRatesMapParams {
  pairs: { sourceCurrency?: string; destCurrency?: string }[];
  workplaceCurrency: string;
  journalDate?: string;
  refreshNonce?: number;
  /** When false, no fetch runs and every pair reports idle. */
  enabled: boolean;
}

/**
 * Fetches workplace-relative market rates for several pairs, keyed by `currencyPairKey`.
 * Results are cached per (pair, currency, date, refresh) so stale responses never
 * surface for a newer request.
 */
export function useCrossCurrencyRatesMap({
  pairs,
  workplaceCurrency,
  journalDate,
  refreshNonce = 0,
  enabled,
}: UseCrossCurrencyRatesMapParams): Record<string, FxFetchedRates> {
  const { fetchRequiredRate, fetchHistoricalRate } = useExchangeRate();
  const [results, setResults] = useState<Record<string, FxFetchedRates>>({});
  const requestedRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  const contextKey = fxOverrideKey(workplaceCurrency, journalDate, refreshNonce);
  const signature = [
    ...new Set(
      pairs
        .filter(pair => pairNeedsFetch({ ...pair, baseCurrency: workplaceCurrency }))
        .map(pair => currencyPairKey(pair.sourceCurrency, pair.destCurrency)),
    ),
  ]
    .sort()
    .join(',');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !signature) return;
    signature.split(',').forEach(pairKey => {
      const requestKey = `${contextKey}#${pairKey}`;
      if (requestedRef.current.has(requestKey)) return;
      requestedRef.current.add(requestKey);
      const [sourceCurrency, destCurrency] = pairKey.split('>');
      void fetchPairRates(
        { sourceCurrency, destCurrency, baseCurrency: workplaceCurrency, journalDate },
        { fetchRequiredRate, fetchHistoricalRate },
      ).then(rates => {
        if (!mountedRef.current) return;
        setResults(previous => ({ ...previous, [requestKey]: rates }));
      });
    });
  }, [
    contextKey,
    enabled,
    fetchHistoricalRate,
    fetchRequiredRate,
    journalDate,
    signature,
    workplaceCurrency,
  ]);

  return useMemo(() => {
    const byPair: Record<string, FxFetchedRates> = {};
    if (!enabled || !signature) return byPair;
    signature.split(',').forEach(pairKey => {
      byPair[pairKey] = results[`${contextKey}#${pairKey}`] ?? LOADING_RATES;
    });
    return byPair;
  }, [contextKey, enabled, results, signature]);
}

export interface UseCrossCurrencyRatesParams {
  sourceCurrency?: string;
  destCurrency?: string;
  workplaceCurrency: string;
  journalDate?: string;
  refreshNonce?: number;
  enabled: boolean;
}

/** Fetches workplace-relative market rates for a single source/destination pair. */
export function useCrossCurrencyRates({
  sourceCurrency,
  destCurrency,
  ...params
}: UseCrossCurrencyRatesParams): FxFetchedRates {
  const pairs = useMemo(() => [{ sourceCurrency, destCurrency }], [sourceCurrency, destCurrency]);
  const rates = useCrossCurrencyRatesMap({ pairs, ...params });
  return rates[currencyPairKey(sourceCurrency, destCurrency)] ?? IDLE_RATES;
}
