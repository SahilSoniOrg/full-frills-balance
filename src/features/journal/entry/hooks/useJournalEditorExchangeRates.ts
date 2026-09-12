import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import { JournalEntryLine } from '@/src/types/domainJournal';
import { logger } from '@/src/utils/logger';
import { showErrorAlert } from '@/src/utils/alerts';
import { useCallback, useEffect, useRef } from 'react';

interface UseJournalEditorExchangeRatesProps {
  lines: JournalEntryLine[];
  workplaceCurrency: string;
  journalDate: string;
  isLoading: boolean;
  isSubmitting: boolean;
  updateLines: (batch: Record<string, Partial<JournalEntryLine>>) => void;
}

export function useJournalEditorExchangeRates({
  lines,
  workplaceCurrency,
  journalDate,
  isLoading,
  isSubmitting,
  updateLines,
}: UseJournalEditorExchangeRatesProps) {
  const { fetchRate, fetchHistoricalRate } = useExchangeRate();
  const autoFetchedLines = useRef<Set<string>>(new Set());
  const previousJournalDate = useRef(journalDate);
  const previousWorkplaceCurrency = useRef(workplaceCurrency);
  const previousLineCurrencies = useRef(new Map<string, string | undefined>());

  const fetchRatesForLines = useCallback(
    async (ids: string[], forceRefresh = false) => {
      const pendingLines = lines.filter(line => ids.includes(line.id) && line.accountCurrency);
      if (pendingLines.length === 0) return;

      try {
        const updates: Record<string, Partial<JournalEntryLine>> = {};
        await Promise.all(
          pendingLines.map(async line => {
            const currency = line.accountCurrency;
            if (!currency) return;

            if (currency === workplaceCurrency) {
              updates[line.id] = { exchangeRate: '' };
            } else {
              const historicalTimestamp = Date.parse(`${journalDate}T00:00:00.000Z`);
              const rate =
                Number.isFinite(historicalTimestamp) && fetchHistoricalRate
                  ? (await fetchHistoricalRate(currency, workplaceCurrency, historicalTimestamp))
                      .rate
                  : await fetchRate(currency, workplaceCurrency, forceRefresh);
              updates[line.id] = { exchangeRate: rate.toString() };
            }
          }),
        );
        updateLines(updates);
      } catch (error) {
        logger.error('Failed to auto-fetch rates for lines', { ids, error });
        showErrorAlert('Failed to fetch exchange rates');
      }
    },
    [lines, fetchRate, fetchHistoricalRate, updateLines, workplaceCurrency, journalDate],
  );

  useEffect(() => {
    if (isLoading) return;

    const dateChanged = previousJournalDate.current !== journalDate;
    if (dateChanged && isSubmitting) return;
    previousJournalDate.current = journalDate;

    const idsToFetch: string[] = [];
    const staleRateUpdates: Record<string, Partial<JournalEntryLine>> = {};
    const workplaceCurrencyChanged = previousWorkplaceCurrency.current !== workplaceCurrency;

    lines.forEach(line => {
      const currency = line.accountCurrency?.trim().toUpperCase();
      const normalizedWorkplaceCurrency = workplaceCurrency.trim().toUpperCase();
      const isForeignLine = Boolean(currency && currency !== normalizedWorkplaceCurrency);
      const lineCurrencyChanged =
        previousLineCurrencies.current.has(line.id) &&
        previousLineCurrencies.current.get(line.id) !== line.accountCurrency;
      const rateContextChanged = dateChanged || workplaceCurrencyChanged || lineCurrencyChanged;

      if (rateContextChanged && line.exchangeRate) {
        staleRateUpdates[line.id] = { exchangeRate: '' };
      }

      if (isForeignLine && (!line.exchangeRate || rateContextChanged) && !isSubmitting) {
        const cacheKey = `${line.id}_${line.accountCurrency}_${journalDate}`;
        if (!autoFetchedLines.current.has(cacheKey)) {
          autoFetchedLines.current.add(cacheKey);
          idsToFetch.push(line.id);
        }
      }

      previousLineCurrencies.current.set(line.id, line.accountCurrency);
    });
    previousWorkplaceCurrency.current = workplaceCurrency;

    if (Object.keys(staleRateUpdates).length > 0) updateLines(staleRateUpdates);
    if (idsToFetch.length > 0) fetchRatesForLines(idsToFetch);
  }, [
    lines,
    workplaceCurrency,
    journalDate,
    fetchRatesForLines,
    isLoading,
    isSubmitting,
    updateLines,
  ]);

  return { fetchRatesForLines };
}
