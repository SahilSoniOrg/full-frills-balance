import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import { JournalEntryLine } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { showErrorAlert } from '@/src/utils/alerts';
import { useCallback, useEffect, useRef } from 'react';

interface UseJournalEditorExchangeRatesProps {
  lines: JournalEntryLine[];
  workplaceCurrency: string;
  isLoading: boolean;
  isSubmitting: boolean;
  updateLines: (batch: Record<string, Partial<JournalEntryLine>>) => void;
}

export function useJournalEditorExchangeRates({
  lines,
  workplaceCurrency,
  isLoading,
  isSubmitting,
  updateLines,
}: UseJournalEditorExchangeRatesProps) {
  const { fetchRate } = useExchangeRate();
  const autoFetchedLines = useRef<Set<string>>(new Set());

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
              const rate = await fetchRate(currency, workplaceCurrency, forceRefresh);
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
    [lines, fetchRate, updateLines, workplaceCurrency],
  );

  useEffect(() => {
    const idsToFetch: string[] = [];

    lines.forEach(line => {
      if (
        line.accountCurrency &&
        line.accountCurrency !== workplaceCurrency &&
        !line.exchangeRate &&
        !isLoading &&
        !isSubmitting
      ) {
        const cacheKey = `${line.id}_${line.accountCurrency}`;
        if (!autoFetchedLines.current.has(cacheKey)) {
          autoFetchedLines.current.add(cacheKey);
          idsToFetch.push(line.id);
        }
      }
    });

    if (idsToFetch.length > 0) fetchRatesForLines(idsToFetch);
  }, [lines, workplaceCurrency, fetchRatesForLines, isLoading, isSubmitting]);

  return { fetchRatesForLines };
}
