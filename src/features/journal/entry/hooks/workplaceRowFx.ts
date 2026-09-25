import {
  RATE_UNAVAILABLE,
  withConvertedAmount,
  resolveFxPair,
  type FxPair,
} from '@/src/features/journal/entry/fxPair';
import { formatManualBaseRate } from '@/src/features/journal/entry/manualBaseRate';
import { parsePositiveRate } from '@/src/services/journal/journalEditorHelpers';
import { getSplitCurrencyPrecision } from '@/src/services/journal/splitJournalHelpers';
import type { JournalEntryLine } from '@/src/types/domainJournal';
import { useCallback } from 'react';

/**
 * One row against the workplace currency.
 * The typed amount stays in the account currency. The exchange rate converts that
 * amount into the workplace currency.
 */
export interface RowFx {
  pair: FxPair;
  inputAmount: string;
  inputCurrency: string;
  inputPrecision: number;
  rowPrecision: number;
}

export interface LineRateFetchState {
  accountCurrency: string;
  valuationCurrency: string;
  journalDate: string;
  requestId: number;
  status: 'loading' | 'error';
}

export function getLineRateFetchState(
  states: Record<string, LineRateFetchState>,
  lineId: string,
  accountCurrency: string | undefined,
  valuationCurrency: string,
  journalDate: string,
): LineRateFetchState | undefined {
  const state = states[lineId];
  if (!state) return undefined;
  return state.accountCurrency.trim().toUpperCase() === accountCurrency?.trim().toUpperCase() &&
    state.valuationCurrency.trim().toUpperCase() === valuationCurrency.trim().toUpperCase() &&
    state.journalDate === journalDate
    ? state
    : undefined;
}

export function buildWorkplaceRowFx(
  line: {
    amount: string;
    accountCurrency?: string;
    exchangeRate?: string | number;
  },
  workplaceCurrency: string,
  fetchState?: LineRateFetchState,
  journalDate?: string,
): RowFx {
  const currency = (line.accountCurrency || workplaceCurrency).trim().toUpperCase();
  const base = workplaceCurrency.trim().toUpperCase();
  const isForeign = currency !== base;
  const hasRate = parsePositiveRate(line.exchangeRate) != null;
  const matchesFetchContext = Boolean(
    fetchState &&
    fetchState.accountCurrency.trim().toUpperCase() === currency &&
    fetchState.journalDate === journalDate,
  );
  const fetched =
    isForeign && !hasRate && matchesFetchContext && fetchState
      ? {
          sourceBaseRate: null,
          destBaseRate: null,
          isLoading: fetchState.status === 'loading',
          error: fetchState.status === 'error' ? RATE_UNAVAILABLE : null,
        }
      : undefined;
  const inputPrecision = getSplitCurrencyPrecision(currency);
  const rowPrecision = getSplitCurrencyPrecision(base);
  const sourceAmount = Number.parseFloat(line.amount);

  return {
    pair: resolveFxPair({
      sourceCurrency: currency,
      destCurrency: base,
      baseCurrency: base,
      sourceAmount: Number.isFinite(sourceAmount) ? sourceAmount : 0,
      destPrecision: rowPrecision,
      saved: hasRate ? { sourceRate: line.exchangeRate } : undefined,
      fetched,
    }),
    inputAmount: line.amount,
    inputCurrency: currency,
    inputPrecision,
    rowPrecision,
  };
}

/** Workplace rate implied by editing the converted amount on an already-built row. */
export function convertedLineRate(fx: RowFx, amount: string): string | null {
  const override = withConvertedAmount(fx.pair, Number.parseFloat(amount));
  if (override?.kind !== 'converted') return null;
  return formatManualBaseRate(override.rates.sourceBaseRate);
}

export function useWorkplaceLineEdits(
  rowFx: Record<string, RowFx>,
  updateLine: (id: string, patch: Partial<JournalEntryLine>) => void,
  fetchRatesForLines: (ids: string[], forceRefresh?: boolean) => void,
) {
  const updateAmount = useCallback(
    (id: string, amount: string) => {
      updateLine(id, { amount });
    },
    [updateLine],
  );

  const updateConvertedAmount = useCallback(
    (id: string, amount: string) => {
      const fx = rowFx[id];
      if (!fx) return;
      const rate = convertedLineRate(fx, amount);
      if (rate == null) return;
      updateLine(id, { exchangeRate: rate });
    },
    [rowFx, updateLine],
  );

  const resetRate = useCallback(
    (id: string) => {
      updateLine(id, { exchangeRate: '' });
      void fetchRatesForLines([id], true);
    },
    [fetchRatesForLines, updateLine],
  );

  return { updateAmount, updateConvertedAmount, resetRate };
}
