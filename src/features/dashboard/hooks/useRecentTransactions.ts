import { AppConfig } from '@/src/constants';
import { useJournalTransactionList } from '@/src/features/journal';
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
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  toggleSelection: (id: JournalId) => void;
  selectAll: () => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  onShareSelected: () => void;
}

/**
 * Headless recent-activity feed for the dashboard.
 * Builds on the shared journal transaction list core.
 * Planned occurrences live in usePlannedOccurrences.
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

  return {
    items: core.items,
    isLoading: core.isLoading,
    isLoadingMore: core.isLoadingMore,
    loadingText,
    loadingMoreText,
    emptyTitle,
    emptySubtitle,
    onEndReached: core.onEndReached,
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
