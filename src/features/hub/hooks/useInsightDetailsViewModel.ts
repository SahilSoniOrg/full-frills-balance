import { attachSelectionActions } from '@/src/components/shared/buildSelectionChrome';
import type { SelectionOverlayProps } from '@/src/components/shared/SelectionOverlay';
import type { ShareableCsvControl } from '@/src/hooks/useJournalCsvExport';
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
import { useCalendarDay } from '@/src/hooks/useCalendarDay';
import type { JournalId } from '@/src/types/ids';
import type { JournalListItem } from '@/src/types/ui';
import { useMemo } from 'react';

export interface InsightDetailsViewModel {
  csvExport?: ShareableCsvControl;
  items: JournalListItem[];
  isLoading: boolean;
  error?: Error | null;
  retry?: () => void;
  header: InsightDetailsHeaderModel;
  emptyTitle: string;
  emptySubtitle: string;
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem?: (id: JournalId) => void;
  selectionChrome?: SelectionOverlayProps;
  modals?: JournalListModalsProps;
}

export function useInsightDetailsViewModel(
  params: InsightDetailsRouteParams,
): InsightDetailsViewModel {
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { theme } = useTheme();
  const today = useCalendarDay();
  const strings = AppConfig.strings.dashboard.insightDetails;

  const journalIds = useMemo(
    () => (params.journalIds ? (params.journalIds.split(',') as JournalId[]) : []),
    [params.journalIds],
  );
  const dateRange = useMemo(
    () => ({
      startDate: 0,
      endDate: today + AppConfig.time.msPerDay,
    }),
    [today],
  );

  const journalList = useJournalEntryList({
    workplaceId,
    pageSize: AppConfig.defaults.insightDetailsFetchLimit,
    dateRange,
    queryOptions: { journalIds },
    shareTitle: 'Insight transactions',
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
  const selectionChrome = useMemo(
    () => attachSelectionActions(journalList.selectionChrome, bulkOperations.actions),
    [journalList.selectionChrome, bulkOperations.actions],
  );

  return {
    csvExport: journalList.csvExport,
    items: journalList.items,
    isLoading: journalList.isLoading,
    error: journalList.error,
    retry: journalList.retry,
    header,
    emptyTitle: strings.emptyTitle,
    emptySubtitle: strings.emptySubtitle,
    selectedIds: journalList.selectedIds,
    isSelectionModeActive: journalList.isSelectionModeActive,
    onLongPressItem: journalList.onLongPressItem,
    selectionChrome,
    modals: bulkOperations.modals,
  };
}
