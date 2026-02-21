import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { JournalListViewProps } from '@/src/features/journal/components/JournalListView';
import { useJournalListScreen } from '@/src/features/journal/hooks/useJournalListScreen';
import { useWealthSummary } from '@/src/features/wealth';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
import { useMonthlyFlow } from '@/src/hooks/useMonthlyFlow';
import { DateRange } from '@/src/utils/dateUtils';
import { preferences } from '@/src/utils/preferences';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface DashboardViewModel {
    isInitialized: boolean;
    hasCompletedOnboarding: boolean;
    listViewProps: Omit<JournalListViewProps, 'screenTitle' | 'showBack' | 'listHeader' | 'fab'>;
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
        onSearchPress: () => void;
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

    const [defaultCurrency, setDefaultCurrency] = useState<string>(AppConfig.defaultCurrency);
    const [isPrefsLoaded, setIsPrefsLoaded] = useState(false);

    useEffect(() => {
        preferences.loadPreferences().then(p => {
            if (p.defaultCurrencyCode) setDefaultCurrency(p.defaultCurrencyCode);
            setIsPrefsLoaded(true);
        });
    }, []);

    const { rateMap } = useExchangeRates(isPrefsLoaded ? defaultCurrency : undefined);

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
    const togglePrivacyMode = useCallback(async () => {
        // Use functional setState to avoid stale closure issues
        const currentMode = isPrivacyMode;
        await setPrivacyMode(!currentMode);
    }, [isPrivacyMode, setPrivacyMode]);

    const { strings } = AppConfig;

    const { listViewProps, vm } = useJournalListScreen({
        pageSize: AppConfig.pagination.dashboardPageSize,
        emptyState: {
            title: strings.dashboard.emptyTitle,
            subtitle: strings.dashboard.emptySubtitle
        },
        exchangeRateMap: rateMap,
        baseCurrency: defaultCurrency,
    });

    const onAddPress = useCallback(() => {
        router.push('/journal-entry');
    }, [router]);

    const onSearchPress = useCallback(() => {
        router.push('/journal');
    }, [router]);

    const greeting = useMemo(() => strings.dashboard.greeting(userName), [userName, strings.dashboard]);
    const sectionTitle = vm.searchQuery ? strings.dashboard.searchResults : strings.dashboard.recentTransactions;

    // Memoize headerProps to prevent re-renders when observables fire
    const headerProps = useMemo(() => ({
        greeting,
        netWorth,
        totalAssets,
        totalLiabilities,
        isSummaryLoading,
        isDashboardHidden: isPrivacyMode,
        onToggleHidden: togglePrivacyMode,
        income,
        expense,
        searchQuery: vm.searchQuery,
        onSearchChange: vm.onSearchChange,
        onSearchPress,
        dateRange: vm.dateRange,
        showDatePicker: vm.showDatePicker,
        navigatePrevious: vm.navigatePrevious,
        navigateNext: vm.navigateNext,
        sectionTitle,
    }), [
        greeting,
        netWorth,
        totalAssets,
        totalLiabilities,
        isSummaryLoading,
        isPrivacyMode,
        togglePrivacyMode,
        income,
        expense,
        vm.searchQuery,
        vm.onSearchChange,
        onSearchPress,
        vm.dateRange,
        vm.showDatePicker,
        vm.navigatePrevious,
        vm.navigateNext,
        sectionTitle,
    ]);

    // Memoize fab object to prevent re-renders
    const fab = useMemo(() => ({
        onPress: onAddPress,
    }), [onAddPress]);

    return {
        isInitialized,
        hasCompletedOnboarding,
        listViewProps,
        headerProps,
        fab,
    };
}
