import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import { fetchCrossCurrencyRates } from '@/src/services/currency/crossCurrencyRates';
import {
  hasManualBaseRateDraft,
  resolveManualWorkplaceRates,
} from '@/src/features/journal/entry/manualBaseRate';
import { logger } from '@/src/utils/logger';
import { useEffect, useRef, useState } from 'react';

export interface UseCrossCurrencyRatesParams {
  sourceCurrency?: string;
  destCurrency?: string;
  workplaceCurrency: string;
  manualSourceBaseRate?: string;
  manualDestBaseRate?: string;
  journalDate?: string;
  /** When false, rates are cleared and no fetch runs. */
  enabled: boolean;
}

export interface CrossCurrencyRatesState {
  exchangeRate: number | null;
  sourceBaseRate: number | null;
  destBaseRate: number | null;
  isLoadingRate: boolean;
  rateError: string | null;
}

/**
 * Fetches workplace-relative FX rates for a simple/cross-currency pair.
 * Uses a request generation token so stale resolutions (after deps change or unmount) are ignored.
 */
export function useCrossCurrencyRates({
  sourceCurrency,
  destCurrency,
  workplaceCurrency,
  manualSourceBaseRate,
  manualDestBaseRate,
  journalDate,
  enabled,
}: UseCrossCurrencyRatesParams): CrossCurrencyRatesState {
  const { fetchRequiredRate, fetchHistoricalRate } = useExchangeRate();

  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [sourceBaseRate, setSourceBaseRate] = useState<number | null>(null);
  const [destBaseRate, setDestBaseRate] = useState<number | null>(null);
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;

    const isLatest = () => !cancelled && requestId === requestIdRef.current;

    if (
      !enabled ||
      !sourceCurrency ||
      !destCurrency ||
      (sourceCurrency === destCurrency && sourceCurrency === workplaceCurrency)
    ) {
      const clearId = setTimeout(() => {
        if (!isLatest()) return;
        setExchangeRate(null);
        setSourceBaseRate(null);
        setDestBaseRate(null);
        setIsLoadingRate(false);
        setRateError(null);
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(clearId);
        requestIdRef.current += 1;
      };
    }

    const fetchCurrentRate = async () => {
      // Defer loading flip so we do not setState synchronously in the effect body.
      await Promise.resolve();
      if (!isLatest()) return;

      const manualRates = resolveManualWorkplaceRates(
        sourceCurrency,
        destCurrency,
        workplaceCurrency,
        manualSourceBaseRate,
        manualDestBaseRate,
      );
      if (manualRates) {
        setSourceBaseRate(manualRates.sourceBaseRate);
        setDestBaseRate(manualRates.destBaseRate);
        setExchangeRate(manualRates.exchangeRate);
        setRateError(null);
        setIsLoadingRate(false);
        return;
      }

      if (
        hasManualBaseRateDraft(
          sourceCurrency,
          destCurrency,
          workplaceCurrency,
          manualSourceBaseRate,
          manualDestBaseRate,
        )
      ) {
        setIsLoadingRate(false);
        return;
      }

      setIsLoadingRate(true);
      setRateError(null);
      setExchangeRate(null);
      setSourceBaseRate(null);
      setDestBaseRate(null);

      try {
        const historicalTimestamp = journalDate
          ? Date.parse(`${journalDate}T00:00:00.000Z`)
          : Number.NaN;
        const rateFetcher =
          Number.isFinite(historicalTimestamp) && fetchHistoricalRate
            ? async (fromCurrency: string, toCurrency: string) =>
                (await fetchHistoricalRate(fromCurrency, toCurrency, historicalTimestamp)).rate
            : fetchRequiredRate;
        const resolved = await fetchCrossCurrencyRates(
          sourceCurrency,
          destCurrency,
          workplaceCurrency,
          rateFetcher,
        );
        if (!isLatest()) return;
        if (!resolved) {
          if (sourceCurrency !== destCurrency || sourceCurrency !== workplaceCurrency) {
            setRateError('Rate unavailable');
          }
          return;
        }
        logger.debug('[DEBUG-FX-SAVE] cross-currency rate resolved', {
          sourceCurrency,
          destCurrency,
          workplaceCurrency,
          journalDate,
          sourceBaseRate: resolved.sourceBaseRate,
          destBaseRate: resolved.destBaseRate,
          exchangeRate: resolved.exchangeRate,
        });
        setSourceBaseRate(resolved.sourceBaseRate);
        setDestBaseRate(resolved.destBaseRate);
        setExchangeRate(resolved.exchangeRate);
      } catch (error) {
        if (!isLatest()) return;
        setExchangeRate(null);
        setSourceBaseRate(null);
        setDestBaseRate(null);
        setRateError('Rate unavailable');
        logger.error('Failed to fetch rate', { sourceCurrency, destCurrency, error });
      } finally {
        if (isLatest()) {
          setIsLoadingRate(false);
        }
      }
    };

    void fetchCurrentRate();

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [
    enabled,
    sourceCurrency,
    destCurrency,
    manualSourceBaseRate,
    manualDestBaseRate,
    fetchRequiredRate,
    fetchHistoricalRate,
    workplaceCurrency,
    journalDate,
  ]);

  return {
    exchangeRate,
    sourceBaseRate,
    destBaseRate,
    isLoadingRate,
    rateError,
  };
}
