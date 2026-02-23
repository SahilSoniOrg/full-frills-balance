import { TransactionBadge } from '@/src/components/common/TransactionCard';
import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { EnrichedJournal, JournalDisplayType } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { getAccountTypeVariant } from '@/src/utils/accountCategory';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { logger } from '@/src/utils/logger';
import { safeAdd, safeSubtract } from '@/src/utils/money';
import { AppNavigation } from '@/src/utils/navigation';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
}

interface UseJournalListViewModelParams {
    pageSize?: number;
    emptyState: JournalListEmptyState;
    loadingText?: string;
    loadingMoreText?: string;
    initialDateRange?: DateRange | null;
    exchangeRateMap?: Record<string, number>;
    baseCurrency?: string;
}

export function useJournalListViewModel({
    pageSize = 50,
    emptyState,
    loadingText = AppConfig.strings.common.loading,
    loadingMoreText = AppConfig.strings.common.loading,
    initialDateRange,
    exchangeRateMap = {},
    baseCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
}: UseJournalListViewModelParams): JournalListViewModel {
    const [searchQuery, setSearchQuery] = useState('');
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
    } = useDateRangeFilter({ defaultToCurrentMonth: true, initialDateRange });

    const { journals, isLoading, isLoadingMore, hasMore, loadMore } = useJournals(pageSize, dateRange || undefined, searchQuery);

    const handleJournalPress = useCallback((journalId: string) => {
        AppNavigation.toTransactionDetails(journalId);
    }, []);

    const onSearchChange = useCallback((value: string) => {
        setSearchQuery(value);
    }, []);

    const onDateSelect = useCallback((range: DateRange | null, filter: PeriodFilter) => {
        setFilter(range, filter);
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
            const displayType = journal.displayType as JournalDisplayType;
            const presentation = journalPresenter.getPresentation(displayType, journal.semanticLabel);

            let typeIcon: IconName = 'document';
            let amountPrefix = '';
            if (displayType === JournalDisplayType.INCOME) {
                typeIcon = 'arrowUp';
                amountPrefix = '+ ';
            } else if (displayType === JournalDisplayType.EXPENSE) {
                typeIcon = 'arrowDown';
                amountPrefix = '− ';
            } else if (displayType === JournalDisplayType.TRANSFER) {
                typeIcon = 'swapHorizontal';
            }

            const badges: TransactionBadge[] = journal.accounts.slice(0, 2).map(acc => {
                const isSource = acc.role === 'SOURCE';
                const isDest = acc.role === 'DESTINATION';
                const showPrefix = isSource ? AppConfig.strings.journal.from : (isDest ? AppConfig.strings.journal.to : '');

                return {
                    text: `${showPrefix}${acc.name}`,
                    variant: getAccountTypeVariant(acc.accountType),
                    icon: (acc.icon as IconName) || (acc.accountType === 'EXPENSE' ? 'tag' : 'wallet'),
                };
            });

            if (journal.accounts.length > 2) {
                badges.push({
                    text: AppConfig.strings.journal.more(journal.accounts.length - 2),
                    variant: 'default',
                });
            }

            const defaultTitle = displayType === JournalDisplayType.TRANSFER
                ? AppConfig.strings.journal.transfer
                : AppConfig.strings.journal.transaction;

            return {
                id: journal.id,
                type: 'transaction' as const,
                date: journal.journalDate,
                onPress: () => handleJournalPress(journal.id),
                cardProps: {
                    title: journal.description || defaultTitle,
                    amount: journal.totalAmount,
                    currencyCode: journal.currencyCode,
                    transactionDate: journal.journalDate,
                    presentation: {
                        label: presentation.label,
                        typeColor: presentation.colorKey,
                        typeIcon,
                        amountPrefix,
                    },
                    badges,
                }
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
    };
}

