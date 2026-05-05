import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { JournalListViewProps, useJournalListScreen } from '@/src/features/journal';
import { useObservable } from '@/src/hooks/useObservable';
import { analytics } from '@/src/services/analytics-service';
import { insightService } from '@/src/services/insight/InsightService';
import {
  notificationService,
  SafeToSpendResult,
} from '@/src/services/notification/NotificationService';
import { smsService } from '@/src/services/sms-service';
import { AppNavigation } from '@/src/utils/navigation';
import React, { useCallback, useMemo } from 'react';
import { Platform, UIManager } from 'react-native';
import { of } from 'rxjs';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface DashboardViewModel {
  isInitialized: boolean;
  hasCompletedOnboarding: boolean;
  isPrivacyMode: boolean;
  listViewProps: Omit<JournalListViewProps, 'screenTitle' | 'showBack' | 'listHeader' | 'fab'>;
  headerProps: {
    greeting: string;
    notificationCount: number;
    isPrivacyMode: boolean;
    onTogglePrivacy: () => void;
    onNotificationsPress: () => void;
    unreadSmsCount?: number;
    onSmsPress?: () => void;
    onSearchPress?: () => void;
  };
  transactionSectionTitle: string;
  fab: {
    onPress: () => void;
    label?: string;
    placement?: 'end' | 'center';
    accessibilityLabel?: string;
  };
  safeToSpendData: SafeToSpendResult | null;
  explanationModalState: {
    visible: boolean;
    setVisible: (v: boolean) => void;
    expandedSection: 'assets' | 'income' | 'committed' | 'debts' | null;
    setExpandedSection: (s: 'assets' | 'income' | 'committed' | 'debts' | null) => void;
  };
  legendModalState: {
    selectedItem: 'safe' | 'committed' | 'debts' | null;
    setSelectedItem: (i: 'safe' | 'committed' | 'debts' | null) => void;
  };
}

export function useDashboardViewModel(): DashboardViewModel {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const { userName, hasCompletedOnboarding, isInitialized, isPrivacyMode } = useUI();

  const [isLocalPrivacyMode, setIsLocalPrivacyMode] = React.useState(isPrivacyMode);

  // Sync with global privacy mode when it changes (e.g. from settings)
  React.useEffect(() => {
    setIsLocalPrivacyMode(isPrivacyMode);
  }, [isPrivacyMode]);

  const onTogglePrivacy = useCallback(() => {
    setIsLocalPrivacyMode(prev => !prev);
  }, []);

  const { data: safeToSpendData } = useObservable(
    () => notificationService.observeSafeToSpend(workplaceId, defaultCurrencyCode),
    [workplaceId],
    null,
  );

  const { data: insights } = useObservable(
    () => insightService.observePatterns(workplaceId),
    [workplaceId],
    [],
  );

  const { data: unreadSmsCount } = useObservable(
    () => (Platform.OS === 'android' ? smsService.observeUnprocessedCount(workplaceId) : of(0)),
    [workplaceId],
    0,
  );

  // Modal states lifted for non-native overlay support
  const [isExplanationVisible, setExplanationVisible] = React.useState(false);
  const [expandedSection, setExpandedSection] = React.useState<
    'assets' | 'income' | 'committed' | 'debts' | null
  >(null);
  const [selectedLegendItem, setSelectedLegendItem] = React.useState<
    'safe' | 'committed' | 'debts' | null
  >(null);

  const totalNotifications = insights?.length || 0;

  const { strings } = AppConfig;

  const { listViewProps, vm } = useJournalListScreen(
    {
      pageSize: AppConfig.pagination.dashboardPageSize,
      emptyState: {
        title: strings.dashboard.emptyTitle,
        subtitle: strings.dashboard.emptySubtitle,
      },
      defaultToCurrentMonth: false,
    },
    workplaceId,
  );

  const onAddPress = useCallback(() => {
    AppNavigation.toJournalEntry();
  }, []);

  const greeting = useMemo(
    () => strings.dashboard.greeting(userName),
    [userName, strings.dashboard],
  );
  const sectionTitle = vm.searchQuery
    ? strings.dashboard.searchResults
    : strings.dashboard.recentTransactions;

  // Memoize headerProps to prevent re-renders when observables fire
  const headerProps = useMemo(
    () => ({
      greeting,
      notificationCount: totalNotifications,
      isPrivacyMode: isLocalPrivacyMode,
      onTogglePrivacy,
      onNotificationsPress: AppNavigation.toHub,
      unreadSmsCount: unreadSmsCount || 0,
      onSmsPress: Platform.OS === 'android' ? AppNavigation.toSmsInbox : undefined,
      onSearchPress: AppNavigation.toJournalSearch,
    }),
    [greeting, totalNotifications, isLocalPrivacyMode, onTogglePrivacy, unreadSmsCount],
  );

  // Memoize fab object to prevent re-renders
  const fab = useMemo(
    () => ({
      onPress: onAddPress,
    }),
    [onAddPress],
  );

  const explanationModalState = useMemo(
    () => ({
      visible: isExplanationVisible,
      setVisible: (v: boolean) => {
        setExplanationVisible(v);
        if (v) analytics.logChartInteracted('safe_to_spend', 'explanation_open');
      },
      expandedSection,
      setExpandedSection: (s: any) => {
        setExpandedSection(s);
        if (s) analytics.logChartInteracted('safe_to_spend', `explanation_expand_${s}`);
      },
    }),
    [isExplanationVisible, expandedSection],
  );

  const legendModalState = useMemo(
    () => ({
      selectedItem: selectedLegendItem,
      setSelectedItem: setSelectedLegendItem,
    }),
    [selectedLegendItem],
  );

  return useMemo(
    () => ({
      isInitialized,
      hasCompletedOnboarding,
      isPrivacyMode: isLocalPrivacyMode,
      listViewProps,
      headerProps,
      transactionSectionTitle: sectionTitle,
      fab,
      safeToSpendData,
      explanationModalState,
      legendModalState,
    }),
    [
      isInitialized,
      hasCompletedOnboarding,
      isLocalPrivacyMode,
      listViewProps,
      headerProps,
      sectionTitle,
      fab,
      safeToSpendData,
      explanationModalState,
      legendModalState,
    ],
  );
}
