import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  buildInsightDetailsHeader,
  type InsightDetailsHeaderModel,
  type InsightDetailsRouteParams,
} from '@/src/features/hub/helpers/insightDetailsPresentation';
import { useJournalEntryList } from '@/src/features/journal';
import { useTheme } from '@/src/hooks/use-theme';
import type { JournalId } from '@/src/types/domain';
import type { JournalListItem } from '@/src/types/ui';
import { getNow } from '@/src/utils/dateHelpers';
import { useMemo } from 'react';

export interface InsightDetailsViewModel {
  items: JournalListItem[];
  isLoading: boolean;
  header: InsightDetailsHeaderModel;
  emptyTitle: string;
  emptySubtitle: string;
}

export function useInsightDetailsViewModel(
  params: InsightDetailsRouteParams,
): InsightDetailsViewModel {
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { theme } = useTheme();
  const strings = AppConfig.strings.dashboard.insightDetails;

  const journalIds = useMemo(
    () => (params.journalIds ? (params.journalIds.split(',') as JournalId[]) : []),
    [params.journalIds],
  );

  const { items, isLoading } = useJournalEntryList({
    workplaceId,
    pageSize: AppConfig.defaults.insightDetailsFetchLimit,
    dateRange: {
      startDate: 0,
      endDate: getNow() + AppConfig.time.msPerDay,
    },
    queryOptions: { journalIds },
    baseCurrency: params.currencyCode || workplaceCurrency,
    paginationPolicy: 'default',
  });

  const header = useMemo(() => buildInsightDetailsHeader(params, theme), [params, theme]);

  return {
    items,
    isLoading,
    header,
    emptyTitle: strings.emptyTitle,
    emptySubtitle: strings.emptySubtitle,
  };
}
