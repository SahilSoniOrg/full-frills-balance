import { getNow } from '@/src/utils/dateHelpers';
import { AppConfig } from '@/src/constants';
import { mapJournalToCardProps } from '@/src/adapters/transactionCardAdapter';
import { observeEnrichedJournals } from '@/src/services/journal/journalEnrichedObserver';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { usePrivacyPrefs } from '@/src/hooks/usePrivacyPrefs';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { EnrichedJournal, TransactionId, WorkplaceId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo } from 'react';
import { of } from 'rxjs';

interface UseInsightDetailsViewModelParams {
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  journalIds: string[];
  baseCurrency?: string;
}

export function useInsightDetailsViewModel({
  workplaceId,
  workplaceCurrency,
  journalIds,
  baseCurrency: manualBaseCurrency,
}: UseInsightDetailsViewModelParams) {
  const { isPrivacyMode } = usePrivacyPrefs();
  const baseCurrency = manualBaseCurrency || workplaceCurrency;
  const journals$ = useMemo(() => {
    if (journalIds.length === 0) return of([]);

    return observeEnrichedJournals(workplaceId, AppConfig.defaults.insightDetailsFetchLimit, {
      startDate: 0,
      endDate: getNow() + AppConfig.time.msPerDay,
      journalIds: journalIds,
    });
  }, [journalIds, workplaceId]);

  // Re-filtering journals locally to match the IDs
  const { data: allJournals, isLoading } = useObservable(() => journals$, [journals$], []);

  // We need a way to filter journals who HAVE the transactions in our list.
  // This is a bit inefficient if we have many journals, but for insights it's usually small.
  // Better: Modify journalService or create a focused one.
  // For now, let's just use the IDs we have.

  const enrichedJournals = useMemo(() => {
    // This is a placeholder for real filtering if needed,
    // but observeEnrichedJournals already returns specific journals if we use accountId etc.
    // For now, let's assume we want to show transactions.
    return allJournals;
  }, [allJournals]);

  useCurrencyPrecision(baseCurrency);

  const transactionGroupingOptions = useMemo(
    () => ({
      items: enrichedJournals,
      getDate: (j: EnrichedJournal) => j.journalDate,
      sortByDate: 'desc' as const,
      getStats: (journalsForDay: EnrichedJournal[]) => {
        return {
          count: journalsForDay.length,
          netAmount: 0, // Not needed for insight details
          currencyCode: baseCurrency,
        };
      },
      renderItem: (journal: EnrichedJournal) => {
        const cardProps = mapJournalToCardProps(journal);

        return {
          id: journal.id as string as TransactionId,
          type: 'transaction' as const,
          date: journal.journalDate,
          onPress: () =>
            AppNavigation.toTransactionDetails(journal.id as string as TransactionId, {
              title: cardProps.title,
              amount: cardProps.amount,
              currencyCode: cardProps.currencyCode,
              date:
                typeof cardProps.transactionDate === 'number'
                  ? cardProps.transactionDate
                  : cardProps.transactionDate.getTime(),
              typeColor: cardProps.presentation.typeColor,
              typeIcon: cardProps.presentation.typeIcon,
              displayType: journal.displayType,
            }),
          cardProps,
        };
      },
    }),
    [enrichedJournals, baseCurrency],
  );

  const { groupedItems: items } = useTransactionGrouping(transactionGroupingOptions);

  return {
    items,
    isLoading,
    isPrivacyMode,
  };
}
