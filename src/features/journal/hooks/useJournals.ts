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
  // Stabilize composite dependencies
  const statusKey = status?.join(',') || 'none';
  const accountIdsKey = options?.accountIds?.join(',') || 'none';

  // Memoize the effective date range object passed to usePaginatedObservable
  // This prevents 'structuralKey' changes in usePaginatedObservable.
  const effectiveRange = useMemo(() => {
    if (!dateRange && !plannedPaymentId && !options?.accountIds) return undefined;
    return {
      ...dateRange,
      plannedPaymentId,
      accountIds: options?.accountIds,
      minAmount: options?.minAmount,
      maxAmount: options?.maxAmount,
      displayType: options?.displayType,
    } as any;
  }, [
    dateRange?.startDate,
    dateRange?.endDate,
    plannedPaymentId,
    accountIdsKey,
    options?.minAmount,
    options?.maxAmount,
    options?.displayType,
  ]);

  const observe = useCallback(
    (limit: number, range?: { startDate: number; endDate: number }, query?: string) => {
      return journalService.observeEnrichedJournals(limit, range as any, query, status);
    },
    [statusKey], // Only recreate if status actually changes
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
    dateRange: effectiveRange,
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
