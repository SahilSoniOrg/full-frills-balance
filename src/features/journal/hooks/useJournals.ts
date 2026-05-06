import { AppConfig } from '@/src/constants';
import { journalService } from '@/src/features/journal/services/JournalService';
import { transactionService } from '@/src/features/journal/services/TransactionService';
import { useObservable } from '@/src/hooks/useObservable';
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { DisplayTransaction, EnrichedJournal, JournalId, WorkplaceId } from '@/src/types/domain';
import { useCallback, useMemo } from 'react';
import { of } from 'rxjs';

import { JournalStatus } from '@/src/data/models/Journal';

export interface JournalFilterRange {
  startDate?: number;
  endDate?: number;
  plannedPaymentId?: string;
  accountIds?: string[];
  minAmount?: number;
  maxAmount?: number;
  displayType?: string;
}

/**
 * Hook to reactively get journals with pagination and account enrichment
 */
export function useJournals(
  workplaceId: WorkplaceId,
  pageSize: number = AppConfig.defaults.journalPageSize,
  dateRange?: { startDate: number; endDate: number },
  searchQuery?: string,
  status?: JournalStatus[],
  plannedPaymentId?: string,
  options?: { minAmount?: number; maxAmount?: number; displayType?: string; accountIds?: string[] },
) {
  // Destructure for stable dependency tracking
  const { startDate, endDate } = dateRange || {};
  const { minAmount, maxAmount, displayType, accountIds } = options || {};

  // Stabilize composite dependencies using content-based keys
  // This prevents 'invisible gremlins' where array literals cause cascading re-renders
  const statusKey = useMemo(() => status?.join('|') ?? 'none', [status]);
  const stableStatus = useMemo(
    () => (statusKey === 'none' ? undefined : (statusKey.split('|') as JournalStatus[])),
    [statusKey],
  );

  const accountIdsKey = useMemo(() => accountIds?.join('|') ?? 'none', [accountIds]);
  const stableAccountIds = useMemo(
    () => (accountIdsKey === 'none' ? undefined : accountIdsKey.split('|')),
    [accountIdsKey],
  );

  // Memoize the effective date range object passed to usePaginatedObservable
  // This prevents 'structuralKey' changes in usePaginatedObservable.
  const effectiveRange: JournalFilterRange | undefined = useMemo(() => {
    if (
      startDate == null &&
      endDate == null &&
      !plannedPaymentId &&
      !stableAccountIds &&
      minAmount === undefined &&
      maxAmount === undefined &&
      displayType === undefined
    )
      return undefined;

    return {
      startDate,
      endDate,
      plannedPaymentId,
      accountIds: stableAccountIds,
      minAmount,
      maxAmount,
      displayType,
    };
  }, [startDate, endDate, plannedPaymentId, stableAccountIds, minAmount, maxAmount, displayType]);

  const observe = useCallback(
    (limit: number, range?: JournalFilterRange, query?: string) => {
      const effectiveOptions = {
        minAmount: range?.minAmount,
        maxAmount: range?.maxAmount,
        displayType: range?.displayType,
      };
      return journalService.observeEnrichedJournals(
        workplaceId,
        limit,
        range as any,
        query,
        stableStatus,
        effectiveOptions,
      );
    },
    [stableStatus, workplaceId],
  );

  const {
    items: journals,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    version,
  } = usePaginatedObservable<any, EnrichedJournal, JournalFilterRange>({
    pageSize,
    filter: effectiveRange,
    searchQuery,
    observe,
    suppressResetOnSearch: true,
    getFilterKey: f => {
      if (!f) return 'none';
      return `${f.startDate}-${f.endDate}-${f.plannedPaymentId}-${f.minAmount}-${f.maxAmount}-${f.displayType}-${f.accountIds?.join(',')}`;
    },
  });

  return { journals, isLoading, isLoadingMore, hasMore, loadMore, version };
}

export function useJournalTransactions(
  workplaceId: WorkplaceId,
  journalId: JournalId | null,
  includeDeleted: boolean = false,
) {
  const {
    data: transactions,
    isLoading,
    version,
  } = useObservable(
    () =>
      journalId
        ? transactionService.observeTransactionsWithAccountInfo(
            workplaceId,
            journalId,
            includeDeleted,
          )
        : of([] as DisplayTransaction[]),
    [workplaceId, journalId, includeDeleted],
    [] as DisplayTransaction[],
  );

  return { transactions, isLoading, version };
}
