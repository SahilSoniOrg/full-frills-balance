import { AppConfig } from '@/src/constants';
import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { buildTimelineGroupingOptions } from '@/src/features/journal/list/hooks/journalDayNetGrouping';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
import { useJournalListGrouping } from '@/src/hooks/useJournalListGrouping';
import { useSelection } from '@/src/hooks/useSelection';
import { useShareable } from '@/src/hooks/useShareable';
import { useJournalCsvExport, type ShareableCsvControl } from '@/src/hooks/useJournalCsvExport';
import { useSharePrefs } from '@/src/hooks/useSharePrefs';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import {
  createSelectedJournalShareable,
  type ShareableJournalEntry,
} from '@/src/services/sharing/JournalShareProvider';
import type { JournalTimelineRow } from '@/src/services/journal/journalTimelineRows';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalStatus } from '@/src/types/enums';
import { JournalTimelineViewer } from '@/src/types/journalTimeline';
import { JournalListItem } from '@/src/types/ui';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';

export type JournalEntryListPaginationPolicy = 'default' | 'always';

export interface UseJournalEntryListParams {
  workplaceId: WorkplaceId;
  enabled?: boolean;
  pageSize?: number;
  dateRange?: { startDate: number; endDate: number };
  searchQuery?: string;
  statuses?: JournalStatus[];
  queryOptions?: {
    minAmount?: number;
    maxAmount?: number;
    displayType?: string;
    accountIds?: AccountId[];
    journalIds?: JournalId[];
    initialItems?: EnrichedJournal[] | (() => EnrichedJournal[]);
  };
  initialItems?: EnrichedJournal[] | (() => EnrichedJournal[]);
  shareTitle?: string;
  paginationPolicy?: JournalEntryListPaginationPolicy;
  viewer?: JournalTimelineViewer;
  /** Override workplace currency for day-net grouping (e.g. insight with linked currency). */
  baseCurrency?: string;
  /** One card row per scoped account leg (e.g. budget with multiple expense accounts). */
  expandScopedLegs?: AccountId[];
}

export interface JournalEntryListCore {
  csvExport: ShareableCsvControl;
  items: JournalListItem[];
  journals: EnrichedJournal[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onEndReached?: () => void;
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  toggleSelection: (id: JournalId) => void;
  selectAll: () => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  onShareSelected: () => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<JournalId>>>;
}

/**
 * Shared journal list/search pipeline: fetch, day grouping, selection, share, pagination.
 */
export function useJournalEntryList({
  workplaceId,
  enabled = true,
  pageSize = AppConfig.defaults.journalPageSize,
  dateRange,
  searchQuery = '',
  statuses,
  queryOptions,
  initialItems,
  shareTitle = 'Journal Report',
  paginationPolicy = 'default',
  viewer,
  baseCurrency: baseCurrencyOverride,
  expandScopedLegs,
}: UseJournalEntryListParams): JournalEntryListCore {
  const { isInitialized } = useAppReady();
  const { defaultShareFormat } = useSharePrefs();
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const baseCurrency = baseCurrencyOverride ?? workplaceCurrency;
  const { rateMap: exchangeRateMap } = useExchangeRates(isInitialized ? baseCurrency : undefined);
  const { precision } = useCurrencyPrecision(baseCurrency);
  const missingCurrenciesCache = useRef(new Set<string>());

  const timelineRowOptions = useMemo(
    () => ({ viewer, expandAccountIds: expandScopedLegs }),
    [viewer, expandScopedLegs],
  );

  const journalOptions = useMemo(
    () => ({
      ...queryOptions,
      initialItems: initialItems ?? queryOptions?.initialItems,
      timelineRowOptions,
      enabled,
    }),
    [enabled, queryOptions, initialItems, timelineRowOptions],
  );

  const { journals, timelineRows, isLoading, isLoadingMore, hasMore, loadMore } = useJournals(
    workplaceId,
    pageSize,
    dateRange,
    searchQuery,
    statuses,
    undefined,
    journalOptions,
  );

  const selectionControl = useSelection<JournalId>();
  const csvQuery = useMemo(
    () => ({
      workplaceId,
      title: shareTitle,
      dateRange: {
        ...dateRange,
        accountIds: queryOptions?.accountIds,
        journalIds: queryOptions?.journalIds,
      },
      searchQuery,
      status: statuses,
      minAmount: queryOptions?.minAmount,
      maxAmount: queryOptions?.maxAmount,
      displayType: queryOptions?.displayType,
    }),
    [workplaceId, shareTitle, dateRange, queryOptions, searchQuery, statuses],
  );
  const csvExport = useJournalCsvExport(csvQuery, {
    disabled: !isInitialized || isLoading || journals.length === 0,
  });
  const {
    selectedIds,
    isSelectionModeActive,
    toggleSelection,
    onLongPressItem,
    clearItems,
    exitSelectionMode,
    setSelectedIds,
  } = selectionControl;

  const handleRowPress = useCallback(
    (row: JournalTimelineRow) => {
      if (isSelectionModeActive) {
        toggleSelection(row.selectionId);
        return;
      }

      AppNavigation.toJournalDetails(row.journal.id);
    },
    [isSelectionModeActive, toggleSelection],
  );

  const groupingOptions = useMemo(
    () =>
      buildTimelineGroupingOptions(
        timelineRows ?? [],
        baseCurrency,
        precision,
        exchangeRateMap,
        handleRowPress,
      ),
    [timelineRows, baseCurrency, exchangeRateMap, handleRowPress, precision],
  );

  const { groupedItems: items } = useJournalListGrouping(groupingOptions);

  const selectedEntries = useMemo<ShareableJournalEntry[]>(
    () =>
      journals
        .filter(j => selectedIds.has(j.id))
        .map(j => ({
          id: j.id,
          date: j.journalDate,
          description: j.description || j.semanticLabel || 'Journal entry',
          amount: j.totalAmount,
          currencyCode: j.currencyCode,
          displayType: j.displayType,
        })),
    [journals, selectedIds],
  );
  const selectedSource = useMemo(
    () =>
      selectedEntries.length
        ? createSelectedJournalShareable(
            selectedEntries,
            {
              title: shareTitle,
              includeTime: true,
              sort: 'desc',
              showEmojis: true,
            },
            workplaceId,
          )
        : null,
    [selectedEntries, shareTitle, workplaceId],
  );
  const selectedShare = useShareable(selectedSource);
  const onShareSelected = useCallback(async () => {
    if (selectedEntries.length === 0) return;
    await selectedShare.share(defaultShareFormat);
  }, [selectedEntries.length, selectedShare, defaultShareFormat]);

  const selectAll = useCallback(() => {
    const visibleIds = [
      ...new Set(
        items
          .filter(i => i.type === 'journal' && i.selectionId)
          .map(i => i.selectionId as JournalId),
      ),
    ];
    selectionControl.selectAll(visibleIds);
  }, [items, selectionControl]);

  useEffect(() => {
    if (selectedIds.size === 0 || isLoading) return;

    setSelectedIds(prev => {
      const validIds = new Set(journals.map(j => j.id));
      const filtered = new Set([...prev].filter(id => validIds.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
  }, [journals, selectedIds, setSelectedIds, isLoading]);

  useEffect(() => {
    const toFetch = new Set<string>();
    journals.forEach(j => {
      if (j.currencyCode !== baseCurrency) {
        const rate = exchangeRateMap[j.currencyCode];
        if (!rate || rate <= 0) {
          if (!missingCurrenciesCache.current.has(j.currencyCode)) {
            toFetch.add(j.currencyCode);
            missingCurrenciesCache.current.add(j.currencyCode);
          }
        }
      }
    });

    toFetch.forEach(currencyCode => {
      exchangeRateService
        .getRate(baseCurrency, currencyCode)
        .catch(e =>
          logger.error(`Failed to dynamically fetch rate for missing currency ${currencyCode}`, e),
        );
    });
  }, [journals, baseCurrency, exchangeRateMap]);

  const onEndReached = useMemo(() => {
    if (paginationPolicy === 'default') {
      if (searchQuery || !hasMore) return undefined;
      return loadMore;
    }

    if (!hasMore) return undefined;
    return () => {
      if (isLoadingMore) return;
      loadMore();
    };
  }, [paginationPolicy, searchQuery, hasMore, loadMore, isLoadingMore]);

  return {
    csvExport,
    items,
    journals,
    isLoading,
    isLoadingMore,
    hasMore,
    onEndReached,
    selectedIds,
    isSelectionModeActive,
    onLongPressItem,
    toggleSelection,
    selectAll,
    clearItems,
    exitSelectionMode,
    onShareSelected,
    setSelectedIds,
  };
}
