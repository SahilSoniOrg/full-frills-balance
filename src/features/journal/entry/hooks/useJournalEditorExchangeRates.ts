import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import { JournalEntryLine } from '@/src/types/domainJournal';
import { logger } from '@/src/utils/logger';
import { showErrorAlert } from '@/src/utils/alerts';
import type { LineRateFetchState } from './workplaceRowFx';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface UseJournalEditorExchangeRatesProps {
  lines: JournalEntryLine[];
  valuationCurrency: string;
  journalDate: string;
  isLoading: boolean;
  isExistingJournal?: boolean;
  journalId?: string;
  isSubmitting: boolean;
  updateLines: (batch: Record<string, Partial<JournalEntryLine>>) => void;
}

export function useJournalEditorExchangeRates({
  lines,
  valuationCurrency,
  journalDate,
  isLoading,
  isExistingJournal = false,
  journalId,
  isSubmitting,
  updateLines,
}: UseJournalEditorExchangeRatesProps) {
  const { fetchRequiredRate, fetchHistoricalRate } = useExchangeRate();
  const [rateFetchStates, setRateFetchStates] = useState<Record<string, LineRateFetchState>>({});
  const latestContextRef = useRef({ lines, valuationCurrency, journalDate, journalId });
  useLayoutEffect(() => {
    latestContextRef.current = { lines, valuationCurrency, journalDate, journalId };
  }, [journalDate, journalId, lines, valuationCurrency]);
  const requestSequenceRef = useRef(0);
  const latestRequestByLineRef = useRef(new Map<string, number>());
  const autoFetchedLines = useRef<Set<string>>(new Set());
  const previousJournalDate = useRef(journalDate);
  const previousValuationCurrency = useRef(valuationCurrency);
  const previousLineCurrencies = useRef(new Map<string, string | undefined>());
  const hasPrimedExistingJournal = useRef(false);
  const previousJournalId = useRef<string | undefined>(undefined);

  const fetchRatesForLines = useCallback(
    async (ids: string[], forceRefresh = false) => {
      const pendingLines = lines.filter(
        (line): line is JournalEntryLine & { accountCurrency: string } =>
          ids.includes(line.id) && Boolean(line.accountCurrency),
      );
      if (pendingLines.length === 0) return;

      pendingLines.forEach(line => {
        autoFetchedLines.current.add(`${line.id}_${line.accountCurrency}_${journalDate}`);
      });

      const requestIds = new Map<string, number>();
      const requestedStates = pendingLines.map(line => {
        const requestId = ++requestSequenceRef.current;
        latestRequestByLineRef.current.set(line.id, requestId);
        requestIds.set(line.id, requestId);
        return [
          line.id,
          {
            accountCurrency: line.accountCurrency,
            valuationCurrency,
            journalDate,
            requestId,
            status: 'loading' as const,
          },
        ] as const;
      });
      setRateFetchStates(previous => ({ ...previous, ...Object.fromEntries(requestedStates) }));

      const requestIsCurrent = (line: JournalEntryLine) => {
        const latest = latestContextRef.current;
        const currentLine = latest.lines.find(candidate => candidate.id === line.id);
        return (
          latestRequestByLineRef.current.get(line.id) === requestIds.get(line.id) &&
          currentLine?.accountCurrency?.trim().toUpperCase() ===
            line.accountCurrency?.trim().toUpperCase() &&
          latest.valuationCurrency.trim().toUpperCase() ===
            valuationCurrency.trim().toUpperCase() &&
          latest.journalDate === journalDate &&
          latest.journalId === journalId
        );
      };

      try {
        const updates: Record<string, Partial<JournalEntryLine>> = {};
        await Promise.all(
          pendingLines.map(async line => {
            const currency = line.accountCurrency;
            if (!currency) return;

            if (currency === valuationCurrency) {
              updates[line.id] = { exchangeRate: '' };
            } else {
              const historicalTimestamp = Date.parse(`${journalDate}T00:00:00.000Z`);
              const rate =
                Number.isFinite(historicalTimestamp) && fetchHistoricalRate
                  ? (await fetchHistoricalRate(currency, valuationCurrency, historicalTimestamp))
                      .rate
                  : await fetchRequiredRate(currency, valuationCurrency, forceRefresh);
              if (rate === null) throw new Error('Exchange rate unavailable');
              updates[line.id] = { exchangeRate: rate.toString() };
            }
          }),
        );
        const currentUpdates = Object.fromEntries(
          Object.entries(updates).filter(([id]) => {
            const line = pendingLines.find(candidate => candidate.id === id);
            return line ? requestIsCurrent(line) : false;
          }),
        );
        if (Object.keys(currentUpdates).length > 0) updateLines(currentUpdates);
        setRateFetchStates(previous => {
          const next = { ...previous };
          pendingLines.forEach(line => {
            if (next[line.id]?.requestId === requestIds.get(line.id)) delete next[line.id];
          });
          return next;
        });
      } catch (error) {
        const currentLines = pendingLines.filter(requestIsCurrent);
        if (currentLines.length > 0) {
          logger.error('Failed to auto-fetch rates for lines', { ids, error });
          setRateFetchStates(previous => {
            const next = { ...previous };
            currentLines.forEach(line => {
              const requestId = requestIds.get(line.id);
              if (requestId === undefined) return;
              next[line.id] = {
                accountCurrency: line.accountCurrency,
                valuationCurrency,
                journalDate,
                requestId,
                status: 'error',
              };
            });
            return next;
          });
          showErrorAlert('Failed to fetch exchange rates');
        }
      }
    },
    [
      lines,
      fetchRequiredRate,
      fetchHistoricalRate,
      updateLines,
      valuationCurrency,
      journalDate,
      journalId,
    ],
  );

  useEffect(() => {
    if (previousJournalId.current !== journalId) {
      previousJournalId.current = journalId;
      hasPrimedExistingJournal.current = false;
      autoFetchedLines.current.clear();
    }

    if (isLoading) return;

    // Hydration supplies saved rates and a saved valuation currency. Treat that as
    // the starting state, not as a currency/date change that should refresh rates.
    if (isExistingJournal && !hasPrimedExistingJournal.current) {
      hasPrimedExistingJournal.current = true;
      previousJournalDate.current = journalDate;
      previousValuationCurrency.current = valuationCurrency;
      previousLineCurrencies.current = new Map(lines.map(line => [line.id, line.accountCurrency]));
      return;
    }

    const dateChanged = previousJournalDate.current !== journalDate;
    if (dateChanged && isSubmitting) return;
    previousJournalDate.current = journalDate;

    const idsToFetch: string[] = [];
    const staleRateUpdates: Record<string, Partial<JournalEntryLine>> = {};
    const valuationCurrencyChanged = previousValuationCurrency.current !== valuationCurrency;

    lines.forEach(line => {
      const currency = line.accountCurrency?.trim().toUpperCase();
      const normalizedValuationCurrency = valuationCurrency.trim().toUpperCase();
      const isForeignLine = Boolean(currency && currency !== normalizedValuationCurrency);
      const lineCurrencyChanged =
        previousLineCurrencies.current.has(line.id) &&
        previousLineCurrencies.current.get(line.id) !== line.accountCurrency;
      const rateContextChanged = dateChanged || valuationCurrencyChanged || lineCurrencyChanged;

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
    previousValuationCurrency.current = valuationCurrency;

    if (Object.keys(staleRateUpdates).length > 0) updateLines(staleRateUpdates);
    if (idsToFetch.length > 0) fetchRatesForLines(idsToFetch);
  }, [
    lines,
    valuationCurrency,
    isExistingJournal,
    journalId,
    journalDate,
    fetchRatesForLines,
    isLoading,
    isSubmitting,
    updateLines,
  ]);

  return { fetchRatesForLines, rateFetchStates };
}
