import { TransactionBadge, TransactionCardProps } from '@/src/components/common/TransactionCard';
import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/data/models/Account';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { EnrichedJournal, JournalDisplayType } from '@/src/types/domain';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { AppNavigation } from '@/src/utils/navigation';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { useCallback, useMemo, useState } from 'react';

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
    cardProps: TransactionCardProps;
    onPress: () => void;
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
}

export function useJournalListViewModel({
    pageSize = 50,
    emptyState,
    loadingText = 'Loading journals...',
    loadingMoreText = 'Loading more...',
    initialDateRange
}: UseJournalListViewModelParams): JournalListViewModel {
    const [searchQuery, setSearchQuery] = useState('');

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

    const { journals, isLoading, isLoadingMore, loadMore } = useJournals(pageSize, dateRange || undefined, searchQuery);

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
        return journals.map((journal: EnrichedJournal) => {
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

            return {
                id: journal.id,
                onPress: () => handleJournalPress(journal.id),
                cardProps: {
                    title: journal.description || (journal.displayType === JournalDisplayType.TRANSFER ? 'Transfer' : 'Transaction'),
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
            };
        });
    }, [journals, handleJournalPress]);

    return {
        items,
        isLoading,
        isLoadingMore,
        onEndReached: searchQuery ? undefined : loadMore,
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
        emptyState,
        loadingText,
        loadingMoreText,
    };
}
