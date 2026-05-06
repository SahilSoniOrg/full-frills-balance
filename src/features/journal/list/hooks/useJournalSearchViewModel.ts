import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import { useAccounts } from '@/src/features/accounts';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
import { useSelection } from '@/src/hooks/useSelection';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { sharingService } from '@/src/services/SharingService';
import { analytics } from '@/src/services/analytics-service';
import { TransactionShareProvider } from '@/src/services/sharing/TransactionShareProvider';
import {
  AccountId,
  EnrichedJournal,
  JournalDisplayType,
  JournalId,
  TransactionId,
} from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { safeAdd, safeSubtract } from '@/src/utils/money';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useJournals } from '../../hooks/useJournals';
import { mapJournalToCardProps } from '../../utils/journalUiUtils';

export interface JournalSearchViewModel {
  items: TransactionListItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  onEndReached?: () => void;

  // Filters
  searchQuery: string;
  setSearchQuery: (val: string) => void;

  dateRange: DateRange | null;
  periodFilter: PeriodFilter;
  setDateRange: (range: DateRange | null, filter: PeriodFilter) => void;

  accountIds: AccountId[];
  setAccountIds: (ids: AccountId[]) => void;

  minAmount: string;
  setMinAmount: (val: string) => void;

  maxAmount: string;
  setMaxAmount: (val: string) => void;

  displayType: string; // '', 'INCOME', 'EXPENSE', 'TRANSFER'
  setDisplayType: (val: string) => void;

  clearFilters: () => void;

  hasMore: boolean;
  plannedJournals: EnrichedJournal[];
  accounts: Account[];

  // Selection
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

export function useJournalSearchViewModel(): JournalSearchViewModel {
  const params = useLocalSearchParams();
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const baseCurrency = defaultCurrencyCode;
  const { defaultShareFormat } = useUI();
  const { rateMap: exchangeRateMap } = useExchangeRates(baseCurrency);
  const { precision } = useCurrencyPrecision(baseCurrency);
  const { accounts } = useAccounts(workplaceId);

  // Route Params
  const qParam = params.q as string;
  const startParam = params.startDate as string;
  const endParam = params.endDate as string;
  const accountIdsParam = params.accountIds as string;
  const minAmountParam = params.minAmount as string;
  const maxAmountParam = params.maxAmount as string;
  const displayTypeParam = params.displayType as string;

  // Filter State
  const [searchQuery, setSearchQuery] = useState(qParam || '');
  const [dateRange, setDateRangeState] = useState<DateRange | null>(() => {
    if (startParam && endParam) {
      const start = Number.parseInt(startParam, 10);
      const end = Number.parseInt(endParam, 10);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        return { startDate: start, endDate: end };
      }
    }
    return null;
  });
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(() => {
    if (startParam && endParam) {
      const start = Number.parseInt(startParam, 10);
      const end = Number.parseInt(endParam, 10);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        return { type: 'CUSTOM' };
      }
    }
    return { type: 'ALL_TIME' };
  });
  const [accountIds, setAccountIds] = useState<AccountId[]>(() => {
    if (accountIdsParam) return accountIdsParam.split(',') as AccountId[];
    return [];
  });
  const [minAmount, setMinAmount] = useState(minAmountParam || '');
  const [maxAmount, setMaxAmount] = useState(maxAmountParam || '');
  const [displayType, setDisplayType] = useState(displayTypeParam || '');

  const setDateRange = useCallback((range: DateRange | null, filter: PeriodFilter) => {
    setDateRangeState(range);
    setPeriodFilter(filter);
  }, []);

  // Track search analytics when query changes (with debounce)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTrackedQueryRef = useRef('');

  useEffect(() => {
    // Only track if query is meaningful (at least 2 chars or has filters)
    const hasMeaningfulQuery =
      searchQuery.length >= 2 ||
      accountIds.length > 0 ||
      minAmount !== '' ||
      maxAmount !== '' ||
      displayType !== '' ||
      dateRange !== null;

    if (!hasMeaningfulQuery) return;

    // Debounce tracking - wait 2 seconds after user stops typing
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      const queryKey = `${searchQuery}:${accountIds.join(',')}:${minAmount}:${maxAmount}:${displayType}:${dateRange?.startDate}`;

      // Don't track the same query multiple times
      if (queryKey === lastTrackedQueryRef.current) return;
      lastTrackedQueryRef.current = queryKey;

      analytics.logSearchPerformed('journal', searchQuery.length);
      // Keep detailed tracking for research
      analytics.trackFeatureUsage('journal_search', 'query_details', {
        query_length: searchQuery.length,
        has_account_filter: accountIds.length > 0,
        account_count: accountIds.length,
        has_amount_filter: minAmount !== '' || maxAmount !== '',
        has_display_type_filter: displayType !== '',
        has_date_filter: dateRange !== null,
        period_filter_type: periodFilter.type,
      });
    }, 2000);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [
    searchQuery,
    accountIds,
    minAmount,
    maxAmount,
    displayType,
    dateRange?.startDate,
    dateRange?.endDate,
    periodFilter.type,
  ]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setDateRangeState(null);
    setPeriodFilter({ type: 'ALL_TIME' });
    setAccountIds([]);
    setMinAmount('');
    setMaxAmount('');
    setDisplayType('');
  }, []);

  // WatermelonDB Query Params
  const queryDateRange = useMemo(
    () =>
      dateRange
        ? {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
          }
        : undefined,
    [dateRange?.startDate, dateRange?.endDate],
  );

  const queryOptions = useMemo(
    () => ({
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      displayType: displayType || undefined,
      accountIds: accountIds.length > 0 ? accountIds : undefined,
    }),
    [minAmount, maxAmount, displayType, accountIds],
  );

  // Data Fetching
  const { journals, isLoading, isLoadingMore, hasMore, loadMore } = useJournals(
    workplaceId,
    AppConfig.defaults.journalPageSize,
    queryDateRange as any,
    searchQuery,
    undefined, // status
    undefined, // plannedPaymentId
    queryOptions as any,
  );

  const onEndReached = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    loadMore();
  }, [hasMore, isLoadingMore, loadMore]);

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
        // Fix: use mode instead of size
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
            if (rate && rate > 0) amount = j.totalAmount / rate;
          }

          if (amount !== 0) {
            if (j.displayType === JournalDisplayType.INCOME)
              netAmount = safeAdd(netAmount, amount, precision);
            else if (j.displayType === JournalDisplayType.EXPENSE)
              netAmount = safeSubtract(netAmount, amount, precision);
          }
        });
        return { count: journalsForDay.length, netAmount, currencyCode: baseCurrency };
      },
      renderItem: (journal: EnrichedJournal) => ({
        id: journal.id as string as TransactionId,
        type: 'transaction' as const,
        date: journal.journalDate,
        onPress: () => handleJournalPress(journal),
        cardProps: mapJournalToCardProps(journal),
      }),
    }),
    [journals, baseCurrency, exchangeRateMap, handleJournalPress, precision],
  );

  const { groupedItems: items } = useTransactionGrouping(transactionGroupingOptions);

  // Cleanup stale selection IDs (defensive cleanup)
  useEffect(() => {
    if (selectedIds.size === 0) return;

    setSelectedIds(prev => {
      const validIds = new Set(journals.map(j => j.id));
      const filtered = new Set([...prev].filter(id => validIds.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
  }, [journals, selectedIds, setSelectedIds]);

  const selectAll = useCallback(() => {
    const visibleIds = items
      .filter(i => i.type === 'transaction')
      .map(i => i.id as string as JournalId);
    selectionControl.selectAll(visibleIds);
  }, [items, selectionControl]);

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
          title: 'Search Transactions',
          includeTime: true,
          sort: 'desc',
          showEmojis: true,
          defaultCurrency: defaultCurrencyCode,
        },
      );
      await sharingService.share(provider, defaultShareFormat);
    } catch (error) {
      logger.error('Failed to share search transactions', error);
    }
  }, [selectedIds, journals, defaultShareFormat]);

  return {
    items,
    isLoading,
    isLoadingMore,
    onEndReached,
    searchQuery,
    setSearchQuery,
    dateRange,
    periodFilter,
    setDateRange,
    accountIds,
    setAccountIds,
    minAmount,
    setMinAmount,
    maxAmount,
    setMaxAmount,
    displayType,
    setDisplayType,
    clearFilters,
    hasMore,
    plannedJournals: [], // Not showing planned in search for now
    accounts,
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
