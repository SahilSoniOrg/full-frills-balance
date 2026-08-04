import { getNow } from '@/src/utils/dateHelpers';
import { AppConfig } from '@/src/constants';
import { mapJournalToCardProps } from '@/src/adapters/transactionCardAdapter';
import {
  buildInsightDetailsHeader,
  type InsightDetailsHeaderModel,
  type InsightDetailsRouteParams,
} from '@/src/features/hub/helpers/insightDetailsPresentation';
import { observeEnrichedJournals } from '@/src/services/journal/journalEnrichedObserver';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useTheme } from '@/src/hooks/use-theme';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { EnrichedJournal, TransactionId } from '@/src/types/domain';
import type { TransactionListItem } from '@/src/types/ui';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo } from 'react';
import { of } from 'rxjs';

export interface InsightDetailsViewModel {
  items: TransactionListItem[];
  isLoading: boolean;
  isPrivacyMode: boolean;
  header: InsightDetailsHeaderModel;
  title: string;
  emptyTitle: string;
  emptySubtitle: string;
}

export function useInsightDetailsViewModel(
  params: InsightDetailsRouteParams,
): InsightDetailsViewModel {
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { theme } = useTheme();
  const isPrivacyMode = useEffectivePrivacyMode();
  const strings = AppConfig.strings.dashboard.insightDetails;

  const journalIds = useMemo(
    () => (params.journalIds ? params.journalIds.split(',') : []),
    [params.journalIds],
  );
  const baseCurrency = params.currencyCode || workplaceCurrency;

  const journals$ = useMemo(() => {
    if (journalIds.length === 0) return of([]);

    return observeEnrichedJournals(workplaceId, AppConfig.defaults.insightDetailsFetchLimit, {
      startDate: 0,
      endDate: getNow() + AppConfig.time.msPerDay,
      journalIds,
    });
  }, [journalIds, workplaceId]);

  const { data: enrichedJournals, isLoading } = useObservable(() => journals$, [journals$], []);

  useCurrencyPrecision(baseCurrency);

  const transactionGroupingOptions = useMemo(
    () => ({
      items: enrichedJournals,
      getDate: (j: EnrichedJournal) => j.journalDate,
      sortByDate: 'desc' as const,
      getStats: (journalsForDay: EnrichedJournal[]) => ({
        count: journalsForDay.length,
        netAmount: 0,
        currencyCode: baseCurrency,
      }),
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

  const header = useMemo(
    () => buildInsightDetailsHeader(params, theme, isPrivacyMode),
    [params, theme, isPrivacyMode],
  );

  return {
    items,
    isLoading,
    isPrivacyMode,
    header,
    title: strings.title,
    emptyTitle: strings.emptyTitle,
    emptySubtitle: strings.emptySubtitle,
  };
}
