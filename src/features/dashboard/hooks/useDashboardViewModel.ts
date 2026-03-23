import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { JournalListViewProps, useJournalListScreen } from '@/src/features/journal';
import { useObservable } from '@/src/hooks/useObservable';
import { notificationService, SafeToSpendResult } from '@/src/services/notification/NotificationService';
import { insightService } from '@/src/services/insight/InsightService';
import { smsService } from '@/src/services/sms-service';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo } from 'react';
import { Platform, UIManager } from 'react-native';
import { of } from 'rxjs';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface DashboardViewModel {
    isInitialized: boolean;
    hasCompletedOnboarding: boolean;
    listViewProps: Omit<JournalListViewProps, 'screenTitle' | 'showBack' | 'listHeader' | 'fab'>;
    headerProps: {
        greeting: string;
        notificationCount: number;
        isPrivacyMode: boolean;
        onTogglePrivacy: () => void;
        onNotificationsPress: () => void;
    };
    transactionSectionTitle: string;
    fab: {
        onPress: () => void;
    };
    safeToSpendData: SafeToSpendResult | null;
}

export function useDashboardViewModel(): DashboardViewModel {
    const { userName, hasCompletedOnboarding, isInitialized, isPrivacyMode, setPrivacyMode } = useUI();

    const onTogglePrivacy = useCallback(() => {
        setPrivacyMode(!isPrivacyMode);
    }, [isPrivacyMode, setPrivacyMode]);

    const { data: safeToSpendData } = useObservable(
        () => notificationService.observeSafeToSpend(),
        [],
        null
    );

    const { data: insights } = useObservable(
        () => insightService.observePatterns(),
        [],
        []
    );

    const { data: unreadSmsCount } = useObservable(
        () => Platform.OS === 'android' ? smsService.observeUnprocessedCount() : of(0),
        [],
        0
    );

    const totalNotifications = (insights?.length || 0) + (unreadSmsCount || 0);

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
        AppNavigation.toJournalEntry();
    }, []);

    const greeting = useMemo(() => strings.dashboard.greeting(userName), [userName, strings.dashboard]);
    const sectionTitle = vm.searchQuery ? strings.dashboard.searchResults : strings.dashboard.recentTransactions;

    // Memoize headerProps to prevent re-renders when observables fire
    const headerProps = useMemo(() => ({
        greeting,
        notificationCount: totalNotifications,
        isPrivacyMode,
        onTogglePrivacy,
        onNotificationsPress: AppNavigation.toHub,
    }), [greeting, totalNotifications, isPrivacyMode, onTogglePrivacy]);

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
