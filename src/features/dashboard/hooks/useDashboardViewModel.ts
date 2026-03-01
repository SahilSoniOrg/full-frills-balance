import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { JournalListViewProps, useJournalListScreen } from '@/src/features/journal';
import { useObservable } from '@/src/hooks/useObservable';
import { insightService, Pattern, SafeToSpendResult } from '@/src/services/insight-service';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
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
        patterns: Pattern[];
    };
    transactionSectionTitle: string;
    fab: {
        onPress: () => void;
    };
    safeToSpendData: SafeToSpendResult | null;
}

export function useDashboardViewModel(): DashboardViewModel {
    const router = useRouter();
    const { userName, hasCompletedOnboarding, isInitialized } = useUI();

    const { data: safeToSpendData } = useObservable(
        () => insightService.observeSafeToSpend(),
        [],
        null
    );

    const { data: patterns } = useObservable(
        () => insightService.observePatterns(),
        [],
        []
    );

    const { strings } = AppConfig;

    const { listViewProps, vm } = useJournalListScreen({
        pageSize: AppConfig.pagination.dashboardPageSize,
        emptyState: {
            title: strings.dashboard.emptyTitle,
            subtitle: strings.dashboard.emptySubtitle
        },
        defaultToCurrentMonth: false,
    });

    const onAddPress = useCallback(() => {
        router.push('/journal-entry');
    }, [router]);

    const greeting = useMemo(() => strings.dashboard.greeting(userName), [userName, strings.dashboard]);
    const sectionTitle = vm.searchQuery ? strings.dashboard.searchResults : strings.dashboard.recentTransactions;

    // Memoize headerProps to prevent re-renders when observables fire
    const headerProps = useMemo(() => ({
        greeting,
        patterns,
    }), [greeting, patterns]);

    // Memoize fab object to prevent re-renders
    const fab = useMemo(() => ({
        onPress: onAddPress,
    }), [onAddPress]);

    return {
        isInitialized,
        hasCompletedOnboarding,
        listViewProps,
        headerProps,
        transactionSectionTitle: sectionTitle,
        fab,
        safeToSpendData,
    };
}
