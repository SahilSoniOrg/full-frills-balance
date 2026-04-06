import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { JournalListViewProps, useJournalListScreen } from '@/src/features/journal';
import { useObservable } from '@/src/hooks/useObservable';
import {
  notificationService,
  SafeToSpendResult,
} from '@/src/services/notification/NotificationService';
import { insightService } from '@/src/services/insight/InsightService';
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
  listViewProps: Omit<JournalListViewProps, 'screenTitle' | 'showBack' | 'listHeader' | 'fab'>;
  headerProps: {
    greeting: string;
    notificationCount: number;
    isPrivacyMode: boolean;
    onTogglePrivacy: () => void;
    onNotificationsPress: () => void;
    unreadSmsCount?: number;
    onSmsPress?: () => void;
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
  const { userName, hasCompletedOnboarding, isInitialized, isPrivacyMode, setPrivacyMode } =
    useUI();

  const onTogglePrivacy = useCallback(() => {
    setPrivacyMode(!isPrivacyMode);
  }, [isPrivacyMode, setPrivacyMode]);

  const { data: safeToSpendData } = useObservable(
    () => notificationService.observeSafeToSpend(),
    [],
    null,
  );

  const { data: insights } = useObservable(() => insightService.observePatterns(), [], []);

  const { data: unreadSmsCount } = useObservable(
    () => (Platform.OS === 'android' ? smsService.observeUnprocessedCount() : of(0)),
    [],
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

  const { listViewProps, vm } = useJournalListScreen({
    pageSize: AppConfig.pagination.dashboardPageSize,
    emptyState: {
      title: strings.dashboard.emptyTitle,
      subtitle: strings.dashboard.emptySubtitle,
    },
    defaultToCurrentMonth: false,
  });

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
      isPrivacyMode,
      onTogglePrivacy,
      onNotificationsPress: AppNavigation.toHub,
      unreadSmsCount: unreadSmsCount || 0,
      onSmsPress: Platform.OS === 'android' ? AppNavigation.toSmsInbox : undefined,
    }),
    [greeting, totalNotifications, isPrivacyMode, onTogglePrivacy, unreadSmsCount],
  );

  // Memoize fab object to prevent re-renders
  const fab = useMemo(
    () => ({
      onPress: onAddPress,
    }),
    [onAddPress],
  );

  return {
    isInitialized,
    hasCompletedOnboarding,
    listViewProps,
    headerProps,
    transactionSectionTitle: sectionTitle,
    fab,
    safeToSpendData,
    explanationModalState: {
      visible: isExplanationVisible,
      setVisible: setExplanationVisible,
      expandedSection,
      setExpandedSection,
    },
    legendModalState: {
      selectedItem: selectedLegendItem,
      setSelectedItem: setSelectedLegendItem,
    },
  };
}
