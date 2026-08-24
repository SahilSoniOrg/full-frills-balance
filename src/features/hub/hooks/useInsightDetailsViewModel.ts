import type { ListSelectionChrome } from '@/src/components/common/SelectionActionBar';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  buildInsightDetailsHeader,
  type InsightDetailsHeaderModel,
  type InsightDetailsRouteParams,
} from '@/src/features/hub/helpers/insightDetailsPresentation';
import {
  useJournalEntryList,
  useJournalsBulkOperations,
  type JournalListModalsProps,
} from '@/src/features/journal';
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
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  selectionChrome: ListSelectionChrome;
  modals?: JournalListModalsProps;
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

  const journalList = useJournalEntryList({
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

  const bulkOperations = useJournalsBulkOperations({
    workplaceId,
    journals: journalList.journals,
    selection: journalList,
    onShareSelected: journalList.onShareSelected,
  });

  const header = useMemo(() => buildInsightDetailsHeader(params, theme), [params, theme]);

  return {
    items: journalList.items,
    isLoading: journalList.isLoading,
    header,
    emptyTitle: strings.emptyTitle,
    emptySubtitle: strings.emptySubtitle,
    selectedIds: journalList.selectedIds,
    isSelectionModeActive: journalList.isSelectionModeActive,
    onLongPressItem: journalList.onLongPressItem,
    selectionChrome: bulkOperations.selectionChrome,
    modals: bulkOperations.modals,
  };
}
