import { AppConfig } from '@/src/constants';
import { useAppReady } from '@/src/contexts/app-shell/AppReadyProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { buildTimelineGroupingOptions } from '@/src/features/journal/list/hooks/journalDayNetGrouping';
import { mapTimelineRowToEntryCardProps } from '@/src/adapters/journalEntryCardAdapter';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
import { useJournalListGrouping } from '@/src/hooks/useJournalListGrouping';
import { useSelection } from '@/src/hooks/useSelection';
import { useSharePrefs } from '@/src/hooks/useSharePrefs';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { sharingService } from '@/src/services/SharingService';
import { JournalShareProvider } from '@/src/services/sharing/JournalShareProvider';
import type { JournalTimelineRow } from '@/src/services/journal/journalTimelineRows';
import {
  AccountId,
  EnrichedJournal,
  JournalId,
  JournalStatus,
  WorkplaceId,
} from '@/src/types/domain';
import { JournalTimelineViewer } from '@/src/types/journalTimeline';
import { JournalListItem } from '@/src/types/ui';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';

export type JournalEntryListPaginationPolicy = 'default' | 'always';

export interface UseJournalEntryListParams {
  workplaceId: WorkplaceId;
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
  items: JournalListItem[];
  journals: EnrichedJournal[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  onEndReached?: () => void;
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  toggleSelection: (id: JournalId) => void;
  toggleMultiple: (ids: JournalId[]) => void;
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
    }),
    [queryOptions, initialItems, timelineRowOptions],
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
  const {
    selectedIds,
    isSelectionModeActive,
    toggleSelection,
    toggleMultiple,
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

      const cardProps = mapTimelineRowToEntryCardProps(row);
      AppNavigation.toJournalDetails(row.journal.id, {
        title: cardProps.title,
        amount: cardProps.amount,
        currencyCode: cardProps.currencyCode,
        date:
          typeof cardProps.transactionDate === 'number'
            ? cardProps.transactionDate
            : cardProps.transactionDate.getTime(),
        typeColor: cardProps.presentation.typeColor,
        typeIcon: cardProps.presentation.typeIcon,
        displayType: row.journal.displayType,
      });
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

  const onShareSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;

    try {
      const selectedJournals = journals.filter(j => selectedIds.has(j.id));
      const provider = new JournalShareProvider(
        selectedJournals.map(j => ({
          id: j.id,
          date: j.journalDate,
          description: j.description || j.semanticLabel || 'Journal entry',
          amount: j.totalAmount,
          currencyCode: j.currencyCode,
          displayType: j.displayType,
        })),
        {
          title: shareTitle,
          includeTime: true,
          sort: 'desc',
          showEmojis: true,
          defaultCurrency: baseCurrency,
        },
      );
      await sharingService.share(provider, defaultShareFormat);
    } catch (error) {
      logger.error('Failed to share journal entries', error);
    }
  }, [selectedIds, journals, defaultShareFormat, baseCurrency, shareTitle]);

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
    items,
    journals,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    onEndReached,
    selectedIds,
    isSelectionModeActive,
    onLongPressItem,
    toggleSelection,
    toggleMultiple,
    selectAll,
    clearItems,
    exitSelectionMode,
    onShareSelected,
    setSelectedIds,
  };
}
