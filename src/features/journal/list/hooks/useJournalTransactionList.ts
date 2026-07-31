import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { JournalStatus } from '@/src/data/models/Journal';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
import { useSelection } from '@/src/hooks/useSelection';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { sharingService } from '@/src/services/SharingService';
import { TransactionShareProvider } from '@/src/services/sharing/TransactionShareProvider';
import { AccountId, EnrichedJournal, JournalId, WorkplaceId } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { mapJournalToCardProps } from '../../utils/journalUiUtils';
import { buildJournalGroupingOptions } from './journalDayNetGrouping';

export type JournalTransactionListPaginationPolicy = 'default' | 'always';

export interface UseJournalTransactionListParams {
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
    initialItems?: EnrichedJournal[] | (() => EnrichedJournal[]);
  };
  initialItems?: EnrichedJournal[] | (() => EnrichedJournal[]);
  shareTitle?: string;
  paginationPolicy?: JournalTransactionListPaginationPolicy;
}

export interface JournalTransactionListCore {
  items: TransactionListItem[];
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
  selectAll: () => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  onShareSelected: () => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<JournalId>>>;
}

/**
 * Shared journal list/search pipeline: fetch, day grouping, selection, share, pagination.
 * Adapters own date/search UI state and planned-journals side fetches.
 */
export function useJournalTransactionList({
  workplaceId,
  pageSize = AppConfig.defaults.journalPageSize,
  dateRange,
  searchQuery = '',
  statuses,
  queryOptions,
  initialItems,
  shareTitle = 'Transactions Report',
  paginationPolicy = 'default',
}: UseJournalTransactionListParams): JournalTransactionListCore {
  const { isInitialized, defaultShareFormat } = useUI();
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const baseCurrency = workplaceCurrency;
  const { rateMap: exchangeRateMap } = useExchangeRates(isInitialized ? baseCurrency : undefined);
  const { precision } = useCurrencyPrecision(baseCurrency);

  const journalOptions = useMemo(
    () => ({
      ...queryOptions,
      initialItems: initialItems ?? queryOptions?.initialItems,
    }),
    [queryOptions, initialItems],
  );

  const { journals, isLoading, isLoadingMore, hasMore, loadMore } = useJournals(
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
    onLongPressItem,
    clearItems,
    exitSelectionMode,
    setSelectedIds,
  } = selectionControl;

  const handleJournalPress = useCallback(
    (journal: EnrichedJournal) => {
      if (isSelectionModeActive) {
        toggleSelection(journal.id);
        return;
      }

      const cardProps = mapJournalToCardProps(journal);
      AppNavigation.toTransactionDetails(journal.id, {
        title: cardProps.title,
        amount: cardProps.amount,
        currencyCode: cardProps.currencyCode,
        date:
          typeof cardProps.transactionDate === 'number'
            ? cardProps.transactionDate
            : (cardProps.transactionDate as Date).getTime(),
        typeColor: cardProps.presentation.typeColor,
        typeIcon: cardProps.presentation.typeIcon,
        displayType: journal.displayType,
      });
    },
    [isSelectionModeActive, toggleSelection],
  );

  const transactionGroupingOptions = useMemo(
    () =>
      buildJournalGroupingOptions(
        journals,
        baseCurrency,
        precision,
        exchangeRateMap,
        handleJournalPress,
      ),
    [journals, baseCurrency, exchangeRateMap, handleJournalPress, precision],
  );

  const { groupedItems: items } = useTransactionGrouping(transactionGroupingOptions);

  const onShareSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;

    try {
      const selectedJournals = journals.filter(j => selectedIds.has(j.id));
      const provider = new TransactionShareProvider(
        selectedJournals.map(j => ({
          id: j.id,
          date: j.journalDate,
          description: j.description || j.semanticLabel || 'Transaction',
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
      logger.error('Failed to share transactions', error);
    }
  }, [selectedIds, journals, defaultShareFormat, baseCurrency, shareTitle]);

  const selectAll = useCallback(() => {
    const visibleIds = items
      .filter(i => i.type === 'transaction')
      .map(i => i.id as string as JournalId);
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
    selectAll,
    clearItems,
    exitSelectionMode,
    onShareSelected,
    setSelectedIds,
  };
}
