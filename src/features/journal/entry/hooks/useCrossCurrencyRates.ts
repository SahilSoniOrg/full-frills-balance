import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import { fetchCrossCurrencyRates } from '@/src/services/currency/crossCurrencyRates';
import { logger } from '@/src/utils/logger';
import { useEffect, useRef, useState } from 'react';

export interface UseCrossCurrencyRatesParams {
  sourceCurrency?: string;
  destCurrency?: string;
  workplaceCurrency: string;
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
  enabled,
}: UseCrossCurrencyRatesParams): CrossCurrencyRatesState {
  const { fetchRate } = useExchangeRate();

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

    if (!enabled || !sourceCurrency || !destCurrency || sourceCurrency === destCurrency) {
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

      setIsLoadingRate(true);
      setRateError(null);

      try {
        const resolved = await fetchCrossCurrencyRates(
          sourceCurrency,
          destCurrency,
          workplaceCurrency,
          fetchRate,
        );
        if (!isLatest() || !resolved) return;
        setSourceBaseRate(resolved.sourceBaseRate);
        setDestBaseRate(resolved.destBaseRate);
        setExchangeRate(resolved.exchangeRate);
      } catch (error) {
        if (!isLatest()) return;
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
  }, [enabled, sourceCurrency, destCurrency, fetchRate, workplaceCurrency]);

  return {
    exchangeRate,
    sourceBaseRate,
    destBaseRate,
    isLoadingRate,
    rateError,
  };
}
