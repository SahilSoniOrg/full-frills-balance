import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { JournalStatus } from '@/src/data/models/Journal';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
import { useSelection } from '@/src/hooks/useSelection';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { sharingService } from '@/src/services/SharingService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { TransactionShareProvider } from '@/src/services/sharing/TransactionShareProvider';
import {
  EnrichedJournal,
  JournalDisplayType,
  JournalId,
  TransactionId,
  WorkplaceId,
} from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { safeAdd, safeSubtract } from '@/src/utils/money';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mapJournalToCardProps } from '../utils/journalUiUtils';

export interface JournalListEmptyState {
  title: string;
  subtitle: string;
}

export interface JournalListViewModel {
  items: TransactionListItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  onEndReached?: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  isSearchGlobal: boolean;
  toggleSearchGlobal: () => void;
  dateRange: DateRange | null;
  periodFilter: PeriodFilter;
  isDatePickerVisible: boolean;
  showDatePicker: () => void;
  hideDatePicker: () => void;
  navigatePrevious?: () => void;
  navigateNext?: () => void;
  onDateSelect: (range: DateRange | null, filter: PeriodFilter) => void;
  hasMore: boolean;
  emptyState: JournalListEmptyState;
  loadingText: string;
  loadingMoreText: string;
  plannedJournals: EnrichedJournal[];
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

interface UseJournalListViewModelParams {
  pageSize?: number;
  emptyState: JournalListEmptyState;
  loadingText?: string;
  loadingMoreText?: string;
  initialDateRange?: DateRange | null;
  defaultToCurrentMonth?: boolean;
  initialItems?: EnrichedJournal[] | (() => EnrichedJournal[]);
}

const PLANNED_STATUS = [JournalStatus.PLANNED];

export function useJournalListViewModel(
  {
    pageSize = AppConfig.defaults.journalPageSize,
    emptyState,
    loadingText = AppConfig.strings.common.loading,
    loadingMoreText = AppConfig.strings.common.loading,
    initialDateRange,
    defaultToCurrentMonth = true,
    initialItems,
  }: UseJournalListViewModelParams,
  workplaceId: WorkplaceId,
): JournalListViewModel {
  const { isInitialized, defaultShareFormat } = useUI();
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const baseCurrency = workplaceCurrency;
  const { rateMap: exchangeRateMap } = useExchangeRates(isInitialized ? baseCurrency : undefined);

  const mountTimeRef = useRef(performance.now());

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchGlobal, setIsSearchGlobal] = useState(true);
  const missingCurrenciesCache = useRef(new Set<string>());

  const {
    dateRange,
    periodFilter,
    isPickerVisible: isDatePickerVisible,
    showPicker: showDatePicker,
    hidePicker: hideDatePicker,
    setFilter,
    navigatePrevious,
    navigateNext,
  } = useDateRangeFilter({ defaultToCurrentMonth, initialDateRange });

  const effectiveDateRange = useMemo(() => {
    if (searchQuery && isSearchGlobal) return undefined;
    return dateRange || undefined;
  }, [searchQuery, isSearchGlobal, dateRange]);

  const { journals, isLoading, isLoadingMore, hasMore, loadMore } = useJournals(
    workplaceId,
    pageSize,
    effectiveDateRange,
    searchQuery,
    undefined,
    undefined,
    { initialItems },
  );

  // Log Journal Query completion
  useEffect(() => {
    if (!isLoading && journals.length > 0) {
      const duration = Math.round(performance.now() - mountTimeRef.current);
      logger.info(`[JournalList] Data Loaded (Count: ${journals.length}) in ${duration}ms`);
      logger.metric('JournalList.LoadTime', duration);
    }
  }, [isLoading, journals.length]);

  const { journals: plannedJournals } = useJournals(
    workplaceId,
    AppConfig.defaults.plannedJournalLimit,
    undefined,
    undefined,
    PLANNED_STATUS,
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
    (journalId: JournalId) => {
      if (isSelectionModeActive) {
        toggleSelection(journalId);
        return;
      }

      const journal = journals.find(j => j.id === journalId);
      if (journal) {
        const cardProps = mapJournalToCardProps(journal);
        AppNavigation.toTransactionDetails(journalId, {
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
      } else {
        AppNavigation.toTransactionDetails(journalId);
      }
    },
    [journals, isSelectionModeActive, toggleSelection],
  );

  const { precision } = useCurrencyPrecision(baseCurrency);

  const transactionGroupingOptions = useMemo(
    () => ({
      items: journals,
      getDate: (j: EnrichedJournal) => j.journalDate,
      sortByDate: 'desc' as const,
      getStats: (journalsForDay: EnrichedJournal[]) => {
        let netAmount = 0;

        journalsForDay.forEach(j => {
          let amount = 0;
          if (j.currencyCode === baseCurrency) {
            amount = j.totalAmount;
          } else {
            const rate = exchangeRateMap[j.currencyCode];
            if (rate && rate > 0) {
              amount = j.totalAmount / rate;
            } else {
              logger.warn(
                AppConfig.strings.journal.errors.missingExchangeRate(j.currencyCode, baseCurrency),
              );
            }
          }

          if (amount !== 0) {
            if (j.displayType === JournalDisplayType.INCOME) {
              netAmount = safeAdd(netAmount, amount, precision);
            } else if (j.displayType === JournalDisplayType.EXPENSE) {
              netAmount = safeSubtract(netAmount, amount, precision);
            }
          }
        });

        return {
          count: journalsForDay.length,
          netAmount,
          currencyCode: baseCurrency,
        };
      },
      renderItem: (journal: EnrichedJournal) => {
        const cardProps = mapJournalToCardProps(journal);

        return {
          id: journal.id as string as TransactionId,
          type: 'transaction' as const,
          date: journal.journalDate,
          onPress: () => handleJournalPress(journal.id),
          cardProps,
        };
      },
    }),
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
          title: 'Transactions Report',
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
  }, [selectedIds, journals, defaultShareFormat, baseCurrency]);

  const selectAll = useCallback(() => {
    const visibleIds = items
      .filter(i => i.type === 'transaction')
      .map(i => i.id as string as JournalId);
    selectionControl.selectAll(visibleIds);
  }, [items, selectionControl]);

  const onSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (value.length > 0 && !searchQuery) {
        setIsSearchGlobal(true);
      }
    },
    [searchQuery],
  );

  const toggleSearchGlobal = useCallback(() => {
    setIsSearchGlobal(prev => !prev);
  }, []);

  const onDateSelect = useCallback(
    (range: DateRange | null, filter: PeriodFilter) => {
      setFilter(range, filter);
      setIsSearchGlobal(false);
      hideDatePicker();
    },
    [hideDatePicker, setFilter],
  );

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

  useEffect(() => {
    if (selectedIds.size === 0 || isLoading) return;

    setSelectedIds(prev => {
      const validIds = new Set(journals.map(j => j.id));
      const filtered = new Set([...prev].filter(id => validIds.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
  }, [journals, selectedIds, setSelectedIds, isLoading]);

  const onEndReached = useMemo(() => {
    if (searchQuery || !hasMore) return undefined;
    return loadMore;
  }, [searchQuery, hasMore, loadMore]);

  return {
    items,
    isLoading,
    isLoadingMore,
    onEndReached,
    searchQuery,
    onSearchChange,
    isSearchGlobal,
    toggleSearchGlobal,
    dateRange,
    periodFilter,
    isDatePickerVisible,
    showDatePicker,
    hideDatePicker,
    navigatePrevious,
    navigateNext,
    onDateSelect,
    hasMore,
    emptyState,
    loadingText,
    loadingMoreText,
    plannedJournals,
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
