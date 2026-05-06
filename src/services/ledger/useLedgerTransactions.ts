import { AppConfig } from '@/src/constants';
import { AccountDateRange, usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { ledgerReadService } from '@/src/services/ledger/ledgerReadService';
import { AccountId, DisplayTransaction, WorkplaceId } from '@/src/types/domain';
import { useCallback } from 'react';

export function useLedgerTransactionsForAccount(
  accountId: AccountId,
  workplaceId: WorkplaceId,
  pageSize: number = AppConfig.defaults.journalPageSize,
  dateRange?: { startDate: number; endDate: number },
) {
  const observe = useCallback(
    (limit: number, range?: AccountDateRange) => {
      return ledgerReadService.observeEnrichedForAccount(
        accountId,
        workplaceId,
        limit,
        range as { startDate: number; endDate: number } | undefined,
      );
    },
    [accountId, workplaceId],
  );

  const {
    items: transactions,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    version,
  } = usePaginatedObservable<DisplayTransaction, DisplayTransaction, AccountDateRange>({
    pageSize,
    filter: dateRange,
    observe,
    getFilterKey: f => (f ? `${f.startDate}-${f.endDate}` : 'none'),
  });

  return { transactions, isLoading, isLoadingMore, hasMore, loadMore, version };
}
