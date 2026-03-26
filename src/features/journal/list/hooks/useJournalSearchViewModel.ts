import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { EnrichedJournal } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { safeAdd, safeSubtract } from '@/src/utils/money';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo, useState } from 'react';
import { mapJournalToCardProps } from '../../utils/journalUiUtils';
import { useJournals } from '../../hooks/useJournals';
import { useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import Account from '@/src/data/models/Account';
import { JournalDisplayType } from '@/src/types/domain';

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
    
    accountIds: string[];
    setAccountIds: (ids: string[]) => void;
    
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
}

export function useJournalSearchViewModel(): JournalSearchViewModel {
    const { defaultCurrency: baseCurrency } = useUI();
    const { rateMap: exchangeRateMap } = useExchangeRates(baseCurrency);
    const { precision } = useCurrencyPrecision(baseCurrency);
    const { accounts } = useAccounts();

    // Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRangeState] = useState<DateRange | null>(null);
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>({ type: 'ALL_TIME' });
    const [accountIds, setAccountIds] = useState<string[]>([]);
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [displayType, setDisplayType] = useState('');

    const setDateRange = useCallback((range: DateRange | null, filter: PeriodFilter) => {
        setDateRangeState(range);
        setPeriodFilter(filter);
    }, []);

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
    const queryDateRange = useMemo(() => dateRange ? {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
    } : undefined, [dateRange]);

    const queryOptions = useMemo(() => ({
        minAmount: minAmount ? parseFloat(minAmount) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
        displayType: displayType || undefined,
        accountIds: accountIds.length > 0 ? accountIds : undefined
    }), [minAmount, maxAmount, displayType, accountIds]);

    // Data Fetching
    const { journals, isLoading, isLoadingMore, hasMore, loadMore } = useJournals(
        AppConfig.defaults.journalPageSize,
        queryDateRange as any,
        searchQuery,
        undefined, // status
        undefined, // plannedPaymentId
        queryOptions as any
    );

    const onEndReached = useCallback(() => {
        if (!hasMore || isLoadingMore) return;
        loadMore();
    }, [hasMore, isLoadingMore, loadMore]);

    const handleJournalPress = useCallback((journal: EnrichedJournal) => {
        const cardProps = mapJournalToCardProps(journal);
        AppNavigation.toTransactionDetails(journal.id, {
            title: cardProps.title,
            amount: cardProps.amount,
            currencyCode: cardProps.currencyCode,
            date: typeof cardProps.transactionDate === 'number' ? cardProps.transactionDate : (cardProps.transactionDate as Date).getTime(),
            typeColor: cardProps.presentation.typeColor,
            typeIcon: cardProps.presentation.typeIcon,
            displayType: journal.displayType
        });
    }, []);

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
                    if (rate && rate > 0) amount = j.totalAmount / rate;
                }
                
                if (amount !== 0) {
                    if (j.displayType === JournalDisplayType.INCOME) netAmount = safeAdd(netAmount, amount, precision);
                    else if (j.displayType === JournalDisplayType.EXPENSE) netAmount = safeSubtract(netAmount, amount, precision);
                }
            });
            return { count: journalsForDay.length, netAmount, currencyCode: baseCurrency };
        },
        renderItem: (journal: EnrichedJournal) => ({
            id: journal.id,
            type: 'transaction' as const,
            date: journal.journalDate,
            onPress: () => handleJournalPress(journal),
            cardProps: mapJournalToCardProps(journal),
        })
    }), [journals, baseCurrency, exchangeRateMap, handleJournalPress, precision]);

    const { groupedItems: items } = useTransactionGrouping(transactionGroupingOptions);

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
    };
}
