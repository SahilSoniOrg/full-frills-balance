import { useUI } from '@/src/contexts/UIContext';
import { useJournalListViewModel } from '@/src/features/journal/hooks/useJournalListViewModel';
import { useWealthSummary } from '@/src/features/wealth';
import { useMonthlyFlow } from '@/src/hooks/useMonthlyFlow';
import { DateRange } from '@/src/utils/dateUtils';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface DashboardViewModel {
    isInitialized: boolean;
    hasCompletedOnboarding: boolean;
    list: ReturnType<typeof useJournalListViewModel>;
    headerProps: {
        greeting: string;
        netWorth: number;
        totalAssets: number;
        totalLiabilities: number;
        isSummaryLoading: boolean;
        isDashboardHidden: boolean;
        onToggleHidden: (hidden: boolean) => void;
        income: number;
        expense: number;
        searchQuery: string;
        onSearchChange: (query: string) => void;
        dateRange: DateRange | null;
        showDatePicker: () => void;
        navigatePrevious?: () => void;
        navigateNext?: () => void;
        sectionTitle: string;
    };
    fab: {
        onPress: () => void;
    };
}

export function useDashboardViewModel(): DashboardViewModel {
    const router = useRouter();
    const { userName, hasCompletedOnboarding, isInitialized, isPrivacyMode, setPrivacyMode } = useUI();

    const {
        netWorth,
        totalAssets,
        totalLiabilities,
        isLoading: isWealthLoading,
    } = useWealthSummary();

    const {
        income,
        expense,
        isLoading: isFlowLoading,
    } = useMonthlyFlow();

    const isSummaryLoading = isWealthLoading || isFlowLoading;
    const togglePrivacyMode = useCallback(() => setPrivacyMode(!isPrivacyMode), [isPrivacyMode, setPrivacyMode]);

    const list = useJournalListViewModel({
        pageSize: 50,
        emptyState: {
            title: 'No transactions yet',
            subtitle: 'Tap the + button to add your first transaction'
        }
    });

    const onAddPress = useCallback(() => {
        router.push('/journal-entry');
    }, [router]);

    const greeting = useMemo(() => `Hi, ${userName || 'there'}!`, [userName]);
    const sectionTitle = list.searchQuery ? 'Search Results' : 'Recent Transactions';

    return {
        isInitialized,
        hasCompletedOnboarding,
        list,
        headerProps: {
            greeting,
            netWorth,
            totalAssets,
            totalLiabilities,
            isSummaryLoading,
            isDashboardHidden: isPrivacyMode,
            onToggleHidden: togglePrivacyMode,
            income,
            expense,
            searchQuery: list.searchQuery,
            onSearchChange: list.onSearchChange,
            dateRange: list.dateRange,
            showDatePicker: list.showDatePicker,
            navigatePrevious: list.navigatePrevious,
            navigateNext: list.navigateNext,
            sectionTitle,
        },
        fab: {
            onPress: onAddPress,
        }
    };
}
