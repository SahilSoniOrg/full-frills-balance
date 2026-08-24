import { AppConfig } from '@/src/constants';
import { useObservable } from '@/src/hooks/useObservable';
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import {
  observeEnrichedJournals,
  observeJournalTimelineRows,
} from '@/src/services/journal/journalTimelineReadModel';
import {
  journalsFromTimelineRows,
  journalsToTimelineRows,
  JournalTimelineRow,
  JournalTimelineRowsOptions,
} from '@/src/services/journal/journalTimelineRows';
import { transactionService } from '@/src/services/transaction-ingestion';
import { DisplayTransaction, EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { JournalStatus } from '@/src/types/enums';
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

function mapInitialTimelineRows(
  initialItems: EnrichedJournal[] | (() => EnrichedJournal[]),
  rowOptions: JournalTimelineRowsOptions,
): JournalTimelineRow[] | (() => JournalTimelineRow[]) {
  const mapRows = (enriched: EnrichedJournal[]) => journalsToTimelineRows(enriched, rowOptions);
  if (typeof initialItems === 'function') {
    return () => mapRows(initialItems());
  }
  return mapRows(initialItems);
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
    timelineRowOptions?: JournalTimelineRowsOptions;
  },
) {
  const { startDate, endDate } = dateRange || {};
  const {
    minAmount,
    maxAmount,
    displayType,
    accountIds,
    journalIds,
    initialItems,
    timelineRowOptions,
  } = options || {};

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
  const stableJournalIds = useMemo((): JournalId[] | undefined => {
    if (journalIdsKey === 'none') return undefined;
    if (journalIdsKey === 'empty') return [];
    return journalIds;
  }, [journalIds, journalIdsKey]);

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
      if (timelineRowOptions) {
        return observeJournalTimelineRows(
          workplaceId,
          limit,
          range,
          query,
          stableStatus,
          effectiveOptions,
          timelineRowOptions,
        );
      }
      return observeEnrichedJournals(
        workplaceId,
        limit,
        range,
        query,
        stableStatus,
        effectiveOptions,
      );
    },
    [stableStatus, workplaceId, timelineRowOptions],
  );

  const paginatedInitialItems = useMemo(() => {
    if (!initialItems || !timelineRowOptions) return initialItems;
    return mapInitialTimelineRows(initialItems, timelineRowOptions);
  }, [initialItems, timelineRowOptions]);

  const { items, isLoading, isLoadingMore, hasMore, loadMore, version } = usePaginatedObservable<
    EnrichedJournal | JournalTimelineRow,
    EnrichedJournal | JournalTimelineRow,
    JournalFilterRange
  >({
    pageSize,
    filter: effectiveRange,
    searchQuery,
    observe,
    suppressResetOnSearch: true,
    getFilterKey: f => {
      if (!f) return 'none';
      return `${f.startDate}-${f.endDate}-${f.plannedPaymentId}-${f.minAmount}-${f.maxAmount}-${f.displayType}-${f.accountIds?.join(',')}-${f.journalIds?.join(',')}`;
    },
    initialItems: paginatedInitialItems as
      (EnrichedJournal | JournalTimelineRow)[] | (() => (EnrichedJournal | JournalTimelineRow)[]),
  });

  if (timelineRowOptions) {
    const timelineRows = items as JournalTimelineRow[];
    return {
      journals: journalsFromTimelineRows(timelineRows),
      timelineRows,
      isLoading,
      isLoadingMore,
      hasMore,
      loadMore,
      version,
    };
  }

  return {
    journals: items as EnrichedJournal[],
    timelineRows: undefined,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    version,
  };
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
