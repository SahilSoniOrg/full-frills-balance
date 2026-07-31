import { AppConfig } from '@/src/constants';
import { JournalStatus } from '@/src/data/models/Journal';
import type { PlannedOccurrenceViewModel } from '@/src/features/dashboard/types/PlannedOccurrenceViewModel';
import {
  useJournals,
  useJournalTransactionList,
  usePlannedOccurrenceActions,
} from '@/src/features/journal';
import { EnrichedJournal, JournalId, WorkplaceId } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';

export interface UseRecentTransactionsParams {
  workplaceId: WorkplaceId;
  pageSize?: number;
  emptyTitle?: string;
  emptySubtitle?: string;
  loadingText?: string;
  loadingMoreText?: string;
  initialItems?: EnrichedJournal[] | (() => EnrichedJournal[]);
}

export interface RecentTransactions {
  items: TransactionListItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  loadingText: string;
  loadingMoreText: string;
  emptyTitle: string;
  emptySubtitle: string;
  onEndReached?: () => void;
  plannedJournals: EnrichedJournal[];
  onPlannedJournalPress: (item: PlannedOccurrenceViewModel) => void;
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  toggleSelection: (id: JournalId) => void;
  selectAll: () => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  onShareSelected: () => void;
}

const PLANNED_STATUS = [JournalStatus.PLANNED];

/**
 * Headless recent-activity feed for the dashboard.
 * Builds on the shared journal transaction list core plus planned-occurrence actions.
 */
export function useRecentTransactions({
  workplaceId,
  pageSize = AppConfig.pagination.dashboardPageSize,
  emptyTitle = AppConfig.strings.dashboard.emptyTitle,
  emptySubtitle = AppConfig.strings.dashboard.emptySubtitle,
  loadingText = AppConfig.strings.common.loading,
  loadingMoreText = AppConfig.strings.common.loading,
  initialItems,
}: UseRecentTransactionsParams): RecentTransactions {
  const core = useJournalTransactionList({
    workplaceId,
    pageSize,
    initialItems,
    shareTitle: 'Transactions Report',
    paginationPolicy: 'default',
  });

  const { journals: plannedJournals } = useJournals(
    workplaceId,
    AppConfig.defaults.plannedJournalLimit,
    undefined,
    undefined,
    PLANNED_STATUS,
  );

  const { onPlannedJournalPress } = usePlannedOccurrenceActions(workplaceId);

  return {
    items: core.items,
    isLoading: core.isLoading,
    isLoadingMore: core.isLoadingMore,
    loadingText,
    loadingMoreText,
    emptyTitle,
    emptySubtitle,
    onEndReached: core.onEndReached,
    plannedJournals,
    onPlannedJournalPress,
    selectedIds: core.selectedIds,
    isSelectionModeActive: core.isSelectionModeActive,
    onLongPressItem: core.onLongPressItem,
    toggleSelection: core.toggleSelection,
    selectAll: core.selectAll,
    clearItems: core.clearItems,
    exitSelectionMode: core.exitSelectionMode,
    onShareSelected: core.onShareSelected,
  };
}
