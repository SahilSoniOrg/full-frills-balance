import { resolveFxPair, type FxFetchedRates } from '@/src/features/journal/entry/fxPair';
import type { SplitRowFx } from '@/src/features/journal/entry/modes/split/splitJournalState';
import { parsePositiveRate } from '@/src/services/journal/journalEditorHelpers';
import { getSplitCurrencyPrecision } from '@/src/services/journal/splitJournalHelpers';
import type { JournalEntryLine } from '@/src/types/domainJournal';

/**
 * One advanced row against the workplace currency.
 * The typed amount stays in the account currency. The exchange rate converts that
 * amount into the base currency, which is how the two sides are compared.
 */
export function buildAdvancedRowFx(
  line: Pick<JournalEntryLine, 'amount' | 'accountCurrency' | 'exchangeRate'>,
  workplaceCurrency: string,
): SplitRowFx {
  const currency = (line.accountCurrency || workplaceCurrency).trim().toUpperCase();
  const base = workplaceCurrency.trim().toUpperCase();
  const isForeign = currency !== base;
  const hasRate = parsePositiveRate(line.exchangeRate) != null;
  const fetched: FxFetchedRates | undefined =
    isForeign && !hasRate
      ? { sourceBaseRate: null, destBaseRate: null, isLoading: true, error: null }
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
