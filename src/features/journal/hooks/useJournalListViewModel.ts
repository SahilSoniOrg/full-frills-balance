import { TransactionBadge, TransactionCardProps } from '@/src/components/common/TransactionCard';
import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/data/models/Account';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { EnrichedJournal, JournalDisplayType } from '@/src/types/domain';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { logger } from '@/src/utils/logger';
import { safeAdd, safeSubtract } from '@/src/utils/money';
import { AppNavigation } from '@/src/utils/navigation';
import { preferences } from '@/src/utils/preferences';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ACCOUNT_TYPE_VARIANTS: Record<AccountType, ComponentVariant> = {
    [AccountType.ASSET]: 'asset',
    [AccountType.LIABILITY]: 'liability',
    [AccountType.EQUITY]: 'equity',
    [AccountType.INCOME]: 'income',
    [AccountType.EXPENSE]: 'expense',
};

export interface JournalListEmptyState {
    title: string;
    subtitle: string;
}

export interface JournalListItemViewModel {
    id: string;
    type: 'transaction' | 'separator';
    date: number; // For separators or sorting
    cardProps?: TransactionCardProps;
    onPress?: () => void;
    isCollapsed?: boolean;
    onToggle?: () => void;
    count?: number; // Added for separators
    netAmount?: number; // Added for separators (normalized to base currency)
    currencyCode?: string; // Added for separators
}

export interface JournalListViewModel {
    items: JournalListItemViewModel[];
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
    const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());
    const missingCurrenciesCache = useRef(new Set<string>());

    const toggleDay = useCallback((timestamp: number) => {
        setCollapsedDays(prev => {
            const next = new Set(prev);
            if (next.has(timestamp)) {
                next.delete(timestamp);
            } else {
                next.add(timestamp);
            }
            return next;
        });
    }, []);

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

    const items = useMemo(() => {
        const result: JournalListItemViewModel[] = [];

        // Group journals by date first to calculate stats
        const dayGroups: Record<number, EnrichedJournal[]> = {};
        const days: number[] = [];

        journals.forEach((journal: EnrichedJournal) => {
            const startOfDay = new Date(journal.journalDate).setHours(0, 0, 0, 0);
            if (!dayGroups[startOfDay]) {
                dayGroups[startOfDay] = [];
                days.push(startOfDay);
            }
            dayGroups[startOfDay].push(journal);
        });

        days.forEach(startOfDay => {
            const journalsForDay = dayGroups[startOfDay];
            const isCollapsed = collapsedDays.has(startOfDay);

            // Calculate daily stats
            const count = journalsForDay.length;
            let netAmount = 0;

            // We normalize EVERYTHING to the base currency
            // amount_in_base = amount_in_other / rate
            const precision = AppConfig.defaultCurrencyPrecision; // Usually 2 for default currency

            journalsForDay.forEach(j => {
                let amount = 0;

                // Normalize to base currency
                // If same currency, no conversion needed
                if (j.currencyCode === baseCurrency) {
                    amount = j.totalAmount;
                } else {
                    const rate = exchangeRateMap[j.currencyCode];
                    if (rate && rate > 0) {
                        amount = j.totalAmount / rate;
                    } else {
                        // Critical: Missing rate means we cannot accurately sum this into netAmount
                        logger.warn(AppConfig.strings.journal.errors.missingExchangeRate(j.currencyCode, baseCurrency));
                    }
                }

                // Net worth change: Income (+), Expense (-)
                if (amount !== 0) {
                    if (j.displayType === JournalDisplayType.INCOME) {
                        netAmount = safeAdd(netAmount, amount, precision);
                    } else if (j.displayType === JournalDisplayType.EXPENSE) {
                        netAmount = safeSubtract(netAmount, amount, precision);
                    }
                }
            });

            result.push({
                id: `sep-${startOfDay}`,
                type: 'separator',
                date: startOfDay,
                isCollapsed,
                onToggle: () => toggleDay(startOfDay),
                count,
                netAmount,
                currencyCode: baseCurrency,
            });

            if (isCollapsed) return;

            journalsForDay.forEach((journal: EnrichedJournal) => {
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

                // Resolve badges from accounts
                const badges: TransactionBadge[] = journal.accounts.slice(0, 2).map(acc => {
                    const isSource = acc.role === 'SOURCE';
                    const isDest = acc.role === 'DESTINATION';
                    const showPrefix = isSource ? AppConfig.strings.journal.from : (isDest ? AppConfig.strings.journal.to : '');

                    return {
                        text: `${showPrefix}${acc.name}`,
                        variant: ACCOUNT_TYPE_VARIANTS[acc.accountType as AccountType],
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

                result.push({
                    id: journal.id,
                    type: 'transaction',
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
                        notes: undefined, // EnrichedJournal doesn't have notes yet
                    }
                });
            });
        });

        return result;
    }, [journals, handleJournalPress, collapsedDays, toggleDay, exchangeRateMap, baseCurrency]);

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
