import { TransactionCardProps } from '@/src/components/common/TransactionCard';
import { IconName } from '@/src/components/core';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { useTheme } from '@/src/hooks/use-theme';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { EnrichedJournal, JournalDisplayType } from '@/src/types/domain';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

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
}

export function useJournalListViewModel({
    pageSize = 50,
    emptyState,
    loadingText = 'Loading journals...',
    loadingMoreText = 'Loading more...'
}: UseJournalListViewModelParams): JournalListViewModel {
    const router = useRouter();
    const { theme } = useTheme();
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
    } = useDateRangeFilter({ defaultToCurrentMonth: true });

    const { journals, isLoading, isLoadingMore, loadMore } = useJournals(pageSize, dateRange || undefined, searchQuery);

    const handleJournalPress = useCallback((journalId: string) => {
        router.push(`/transaction-details?journalId=${journalId}`);
    }, [router]);

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
            const presentation = journalPresenter.getPresentation(displayType, theme, journal.semanticLabel);

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
                        typeColor: presentation.colorHex,
                        typeIcon,
                        amountPrefix,
                    },
                    accounts: journal.accounts,
                }
            };
        });
    }, [journals, handleJournalPress, theme]);

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
