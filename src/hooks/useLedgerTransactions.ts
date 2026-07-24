import { AppConfig } from '@/src/constants';
import { DateRange, usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { observeDisplayTransactionsForAccount } from '@/src/services/ledger/ledgerEnrichedDisplay';
import { AccountId, DisplayTransaction, WorkplaceId } from '@/src/types/domain';
import { useCallback } from 'react';

export function useLedgerTransactionsForAccount(
  accountId: AccountId,
  workplaceId: WorkplaceId,
  pageSize: number = AppConfig.defaults.journalPageSize,
  dateRange?: DateRange,
) {
  const observe = useCallback(
    (limit: number, range?: DateRange) => {
      return observeDisplayTransactionsForAccount(accountId, workplaceId, limit, range);
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
  } = usePaginatedObservable<DisplayTransaction, DisplayTransaction, DateRange>({
    pageSize,
    filter: dateRange,
    observe,
    getFilterKey: f => (f ? `${f.startDate}-${f.endDate}` : 'none'),
  });

  return { transactions, isLoading, isLoadingMore, hasMore, loadMore, version };
}
