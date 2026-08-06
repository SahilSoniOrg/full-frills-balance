import { AppConfig } from '@/src/constants';
import { JournalStatus } from '@/src/data/models/Journal';
import { useObservable } from '@/src/hooks/useObservable';
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { observeEnrichedJournals } from '@/src/services/journal/journalTimelineReadModel';
import { transactionService } from '@/src/services/transaction-ingestion';
import { DisplayTransaction, EnrichedJournal, JournalId, WorkplaceId } from '@/src/types/domain';
import { useCallback, useMemo } from 'react';
import { of } from 'rxjs';

export interface JournalFilterRange {
  startDate?: number;
  endDate?: number;
  plannedPaymentId?: string;
  accountIds?: string[];
  journalIds?: JournalId[];
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
  options?: {
    minAmount?: number;
    maxAmount?: number;
    displayType?: string;
    accountIds?: string[];
    journalIds?: JournalId[];
    initialItems?: EnrichedJournal[] | (() => EnrichedJournal[]);
  },
) {
  const { startDate, endDate } = dateRange || {};
  const { minAmount, maxAmount, displayType, accountIds, journalIds, initialItems } = options || {};

  const statusKey = useMemo(() => status?.join('|') ?? 'none', [status]);
  const stableStatus = useMemo(
    () => (statusKey === 'none' ? undefined : (statusKey.split('|') as JournalStatus[])),
    [statusKey],
  );

  const accountIdsKey = useMemo(() => {
    if (accountIds === undefined) return 'none';
    if (accountIds.length === 0) return 'empty';
    return accountIds.join('|');
  }, [accountIds]);
  const stableAccountIds = useMemo(
    () =>
      accountIdsKey === 'none'
        ? undefined
        : accountIdsKey === 'empty'
          ? ([] as string[])
          : accountIdsKey.split('|'),
    [accountIdsKey],
  );

  const journalIdsKey = useMemo(() => {
    if (journalIds === undefined) return 'none';
    if (journalIds.length === 0) return 'empty';
    return journalIds.join('|');
  }, [journalIds]);
  const stableJournalIds = useMemo(
    () =>
      journalIdsKey === 'none'
        ? undefined
        : journalIdsKey === 'empty'
          ? ([] as JournalId[])
          : (journalIdsKey.split('|') as JournalId[]),
    [journalIdsKey],
  );

  const effectiveRange: JournalFilterRange | undefined = useMemo(() => {
    if (
      startDate == null &&
      endDate == null &&
      !plannedPaymentId &&
      !stableAccountIds &&
      !stableJournalIds &&
      minAmount === undefined &&
      maxAmount === undefined &&
      displayType === undefined
    ) {
      return undefined;
    }

    return {
      startDate,
      endDate,
      plannedPaymentId,
      accountIds: stableAccountIds,
      journalIds: stableJournalIds,
      minAmount,
      maxAmount,
      displayType,
    };
  }, [
    startDate,
    endDate,
    plannedPaymentId,
    stableAccountIds,
    stableJournalIds,
    minAmount,
    maxAmount,
    displayType,
  ]);

  const observe = useCallback(
    (limit: number, range?: JournalFilterRange, query?: string) => {
      if (range?.accountIds?.length === 0 || range?.journalIds?.length === 0) {
        return of([]);
      }
      const effectiveOptions = {
        minAmount: range?.minAmount,
        maxAmount: range?.maxAmount,
        displayType: range?.displayType,
      };
      return observeEnrichedJournals(
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
      return `${f.startDate}-${f.endDate}-${f.plannedPaymentId}-${f.minAmount}-${f.maxAmount}-${f.displayType}-${f.accountIds?.join(',')}-${f.journalIds?.join(',')}`;
    },
    initialItems,
  });

  return { journals, isLoading, isLoadingMore, hasMore, loadMore, version };
}

export function useJournalLegs(
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
