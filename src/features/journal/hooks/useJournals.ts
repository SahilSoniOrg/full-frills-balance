import { AppConfig } from '@/src/constants';
import { journalService } from '@/src/features/journal/services/JournalService';
import { transactionService } from '@/src/features/journal/services/TransactionService';
import { useObservable } from '@/src/hooks/useObservable';
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { useLedgerTransactionsForAccount } from '@/src/services/ledger';
import { DisplayTransaction, EnrichedJournal } from '@/src/types/domain';
import { useCallback, useMemo } from 'react';
import { of } from 'rxjs';

import { JournalStatus } from '@/src/data/models/Journal';

/**
 * Hook to reactively get journals with pagination and account enrichment
 */
export function useJournals(
  pageSize: number = AppConfig.defaults.journalPageSize,
  dateRange?: { startDate: number; endDate: number },
  searchQuery?: string,
  status?: JournalStatus[],
  plannedPaymentId?: string,
  options?: { minAmount?: number; maxAmount?: number; displayType?: string; accountIds?: string[] },
) {
  // Stabilize inputs so callers can pass inline arrays/objects without breaking memoization
  const stableStatusKey = status?.join(',') || '';
  const stableOptionsKey = options
    ? JSON.stringify([
        options.minAmount,
        options.maxAmount,
        options.displayType,
        options.accountIds,
      ])
    : '';

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableStatus = useMemo(() => (status ? [...status] : status), [stableStatusKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableOptions = useMemo(() => (options ? { ...options } : options), [stableOptionsKey]);

  const observe = useCallback(
    (limit: number, range?: { startDate: number; endDate: number }, query?: string) => {
      const enrichedRange =
        range || plannedPaymentId
          ? ({ ...range, plannedPaymentId, accountIds: stableOptions?.accountIds } as any)
          : undefined;
      return journalService.observeEnrichedJournals(
        limit,
        enrichedRange,
        query,
        stableStatus,
        stableOptions,
      );
    },
    [stableStatus, plannedPaymentId, stableOptions],
  );

  const {
    items: journals,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    version,
  } = usePaginatedObservable<any, EnrichedJournal>({
    pageSize,
    dateRange:
      dateRange || plannedPaymentId || stableOptions?.accountIds
        ? ({ ...dateRange, plannedPaymentId, accountIds: stableOptions?.accountIds } as any)
        : undefined,
    searchQuery,
    observe,
    suppressResetOnSearch: true,
  });

  return { journals, isLoading, isLoadingMore, hasMore, loadMore, version };
}

/**
 * Custom hook to get reactively updated transactions for an account
 *
 * Note: This hook uses repository-owned enriched observables to react to account changes.
 */
export function useAccountTransactions(
  accountId: string,
  pageSize: number = AppConfig.defaults.journalPageSize,
  dateRange?: { startDate: number; endDate: number },
) {
  return useLedgerTransactionsForAccount(accountId, pageSize, dateRange);
}

export function useJournalTransactions(journalId: string | null, includeDeleted: boolean = false) {
  const {
    data: transactions,
    isLoading,
    version,
  } = useObservable(
    () =>
      journalId
        ? transactionService.observeTransactionsWithAccountInfo(journalId, includeDeleted)
        : of([] as DisplayTransaction[]),
    [journalId, includeDeleted],
    [] as DisplayTransaction[],
  );

  return { transactions, isLoading, version };
}
