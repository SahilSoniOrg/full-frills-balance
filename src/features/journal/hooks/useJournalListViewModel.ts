import { AppConfig } from '@/src/constants';
import { JournalStatus } from '@/src/data/models/Journal';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { EnrichedJournal, JournalDisplayType } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { safeAdd, safeSubtract } from '@/src/utils/money';
import { AppNavigation } from '@/src/utils/navigation';
import { preferences } from '@/src/utils/preferences';
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
}

interface UseJournalListViewModelParams {
    pageSize?: number;
    emptyState: JournalListEmptyState;
    loadingText?: string;
    loadingMoreText?: string;
    initialDateRange?: DateRange | null;
    exchangeRateMap?: Record<string, number>;
    baseCurrency?: string;
    defaultToCurrentMonth?: boolean;
}

export function useJournalListViewModel({
    pageSize = AppConfig.defaults.journalPageSize,
    emptyState,
    loadingText = AppConfig.strings.common.loading,
    loadingMoreText = AppConfig.strings.common.loading,
    initialDateRange,
    exchangeRateMap = {},
    baseCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
    defaultToCurrentMonth = true,
}: UseJournalListViewModelParams): JournalListViewModel {
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

    const { journals, isLoading, isLoadingMore, hasMore, loadMore } = useJournals(pageSize, effectiveDateRange, searchQuery);

    const { journals: plannedJournals } = useJournals(AppConfig.defaults.plannedJournalLimit, undefined, undefined, [JournalStatus.PLANNED]);

    const handleJournalPress = useCallback((journalId: string) => {
        AppNavigation.toTransactionDetails(journalId);
    }, []);

    const onSearchChange = useCallback((value: string) => {
        setSearchQuery(value);
        if (value.length > 0 && !searchQuery) {
            // Just started searching, reset to global by default
            setIsSearchGlobal(true);
        }
    }, [searchQuery]);

    const toggleSearchGlobal = useCallback(() => {
        setIsSearchGlobal(prev => !prev);
    }, []);

    const onDateSelect = useCallback((range: DateRange | null, filter: PeriodFilter) => {
        setFilter(range, filter);
        setIsSearchGlobal(false); // If they manually pick a date, respect it
        hideDatePicker();
    }, [hideDatePicker, setFilter]);

    const { precision } = useCurrencyPrecision(baseCurrency);

    const transactionGroupingOptions = useMemo(() => ({
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
                        logger.warn(AppConfig.strings.journal.errors.missingExchangeRate(j.currencyCode, baseCurrency));
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
                id: journal.id,
                type: 'transaction' as const,
                date: journal.journalDate,
                onPress: () => handleJournalPress(journal.id),
                cardProps,
            };
        }
    }), [journals, baseCurrency, exchangeRateMap, handleJournalPress, precision]);

    const { groupedItems: items } = useTransactionGrouping(transactionGroupingOptions);

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
            exchangeRateService.getRate(baseCurrency, currencyCode)
                .catch(e => logger.error(`Failed to dynamically fetch rate for missing currency ${currencyCode}`, e));
        });
    }, [journals, baseCurrency, exchangeRateMap]);

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
    };
}

