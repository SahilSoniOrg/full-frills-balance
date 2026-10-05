import {
  resolveFxPair,
  withConvertedAmount,
  type FxFetchedRates,
  type FxOverride,
  type FxPair,
  type FxSavedRates,
} from '@/src/domain/accounting/fxPair';
import { useCrossCurrencyRates } from '@/src/hooks/useCrossCurrencyRates';
import { useMemo } from 'react';

export interface UseFxPairDraftInput {
  sourceCurrency?: string;
  destCurrency?: string;
  baseCurrency: string;
  sourceAmount: number;
  destPrecision?: number;
  journalDate?: string;
  refreshNonce?: number;
  enabled: boolean;
  saved?: FxSavedRates | null;
  /** When true, market fetch is skipped and saved line rates drive the pair. */
  useSavedRates?: boolean;
  override?: FxOverride;
  /** When > 0, applies a converted-destination override on top of the market estimate. */
  convertedDestAmount?: number;
}

export function useFxPairDraft({
  sourceCurrency,
  destCurrency,
  baseCurrency,
  sourceAmount,
  destPrecision,
  journalDate,
  refreshNonce,
  enabled,
  saved,
  useSavedRates = false,
  override,
  convertedDestAmount,
}: UseFxPairDraftInput): { pair: FxPair; fetchedRates: FxFetchedRates } {
  const fetchedRates = useCrossCurrencyRates({
    sourceCurrency,
    destCurrency,
    workplaceCurrency: baseCurrency,
    journalDate,
    refreshNonce,
    enabled: enabled && !useSavedRates,
  });

  const pair = useMemo(() => {
    const input = {
      sourceCurrency,
      destCurrency,
      baseCurrency,
      fetched: useSavedRates ? null : fetchedRates,
      saved: useSavedRates ? saved : null,
      override,
      sourceAmount,
      destPrecision,
    };
    const estimate = resolveFxPair(input);
    if (convertedDestAmount !== undefined && convertedDestAmount > 0) {
      const nextOverride = withConvertedAmount(estimate, convertedDestAmount);
      if (nextOverride) return resolveFxPair({ ...input, override: nextOverride });
    }
    return estimate;
  }, [
    baseCurrency,
    convertedDestAmount,
    destCurrency,
    destPrecision,
    fetchedRates,
    override,
    saved,
    sourceAmount,
    sourceCurrency,
    useSavedRates,
  ]);

  return { pair, fetchedRates };
}
