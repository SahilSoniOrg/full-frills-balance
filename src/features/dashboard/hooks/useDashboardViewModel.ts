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
import { logger as appLogger } from '@/src/utils/logger';
import { Platform, UIManager } from 'react-native';
import { of } from 'rxjs';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

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
  const { userName, hasCompletedOnboarding, isInitialized, isPrivacyMode, isSmsImportEnabled } =
    useUI();

  const mountTimeRef = useRef(performance.now());

  // Log UI Initialization (Prefs Loaded)
  useEffect(() => {
    if (isInitialized) {
      const duration = Math.round(performance.now() - mountTimeRef.current);
      appLogger.info(`[Dashboard] UI Initialized (Prefs Loaded) in ${duration}ms`);
    }
  }, [isInitialized]);

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

  const hasSafeToSpendData = !!safeToSpendData;
  // Log Safe To Spend Data arrival
  useEffect(() => {
    if (hasSafeToSpendData) {
      const duration = Math.round(performance.now() - mountTimeRef.current);
      appLogger.info(`[Dashboard] SafeToSpend Data Loaded in ${duration}ms`);
    }
  }, [hasSafeToSpendData]);

  const { data: insights } = useObservable(
    () => insightService.observePatterns(workplaceId),
    [workplaceId],
    [],
  );

  const hasInsights = !!(insights && insights.length > 0);
  // Log Insights arrival
  useEffect(() => {
    if (hasInsights) {
      const duration = Math.round(performance.now() - mountTimeRef.current);
      appLogger.info(`[Dashboard] Insights Loaded in ${duration}ms`);
    }
  }, [hasInsights]);

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

  const hasJournalItems = listViewProps.items.length > 0;
  // Log Journal List arrival
  useEffect(() => {
    if (hasJournalItems) {
      const duration = Math.round(performance.now() - mountTimeRef.current);
      appLogger.info(`[Dashboard] Journal List Items Loaded in ${duration}ms`);
    }
  }, [hasJournalItems]);

  // Log "Fully Ready" state
  useEffect(() => {
    if (isInitialized && hasSafeToSpendData && hasJournalItems) {
      const duration = Math.round(performance.now() - mountTimeRef.current);
      appLogger.info(`[Dashboard] Fully Ready in ${duration}ms`);
      appLogger.metric('Dashboard.FullyReady', duration);
    }
  }, [isInitialized, hasSafeToSpendData, hasJournalItems]);

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
      onSmsPress:
        Platform.OS === 'android' && (isSmsImportEnabled || (unreadSmsCount || 0) > 0)
          ? AppNavigation.toSmsInbox
          : undefined,
      onSearchPress: AppNavigation.toJournalSearch,
    }),
    [
      greeting,
      totalNotifications,
      isLocalPrivacyMode,
      onTogglePrivacy,
      unreadSmsCount,
      isSmsImportEnabled,
    ],
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
