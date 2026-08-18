import { getPerfNow } from '@/src/utils/dateHelpers';
import { AppConfig } from '@/src/constants';
import { useAppReady, useOnboardingSession } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useDashboardPreferences } from '@/src/hooks/useDashboardPreferences';
import {
  RecentJournalEntries,
  useRecentJournalEntries,
} from '@/src/features/dashboard/hooks/useRecentJournalEntries';
import { PlannedOccurrencesResult, usePlannedOccurrences } from '@/src/features/planned-payments';
import { analytics } from '@/src/services/analytics-service';
import { useObservable } from '@/src/hooks/useObservable';
import { safeToSpendReadModel } from '@/src/services/simulation/SafeToSpendReadModel';
import type { SafeToSpendDashboard } from '@/src/services/simulation/safeToSpendDashboardProjection';
import type { DashboardData } from '@/src/services/ReactiveDataService';
import { logger as appLogger } from '@/src/utils/logger';
import { snapshotService } from '@/src/utils/SnapshotService';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY } from 'rxjs';

export interface DashboardViewModel {
  hasCompletedOnboarding: boolean;
  showSafeToSpendChart: boolean;
  recentJournalEntries: RecentJournalEntries;
  plannedOccurrences: PlannedOccurrencesResult;
  journalSectionTitle: string;
  safeToSpendData: SafeToSpendDashboard | null;
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

type DashboardExplanationSection = 'assets' | 'income' | 'committed' | 'debts';
type DashboardLegendItem = 'safe' | 'committed' | 'debts';

export function useDashboardViewModel(): DashboardViewModel {
  const { workplaceId } = useWorkplace();
  const { isInitialized, isAppReady } = useAppReady();
  const { hasCompletedOnboarding } = useOnboardingSession();
  const { showSafeToSpendChart } = useDashboardPreferences();

  const mountTimeRef = useRef<number>(0);
  useEffect(() => {
    mountTimeRef.current = getPerfNow();
  }, []);

  // Log UI Initialization (Prefs Loaded)
  useEffect(() => {
    if (isInitialized) {
      const duration = Math.round(getPerfNow() - (mountTimeRef.current || 0));
      appLogger.info(`[Dashboard] UI Initialized (Prefs Loaded) in ${duration}ms`);
    }
  }, [isInitialized]);

  const { data: safeToSpendData } = useObservable<SafeToSpendDashboard | null>(
    () => (isAppReady ? safeToSpendReadModel.forWorkplace(workplaceId).watch() : EMPTY),
    [workplaceId, isAppReady],
    () => snapshotService.getCustomSnapshot<SafeToSpendDashboard>(workplaceId, `safe_to_spend`),
  );

  const hasSafeToSpendData = !!safeToSpendData;
  // Log Safe To Spend Data arrival
  useEffect(() => {
    if (hasSafeToSpendData) {
      const duration = Math.round(getPerfNow() - (mountTimeRef.current || 0));
      appLogger.info(`[Dashboard] SafeToSpend Data Loaded in ${duration}ms`);
    }
  }, [hasSafeToSpendData]);

  const [isExplanationVisible, setExplanationVisible] = useState(false);
  const [expandedSection, setExpandedSection] = useState<DashboardExplanationSection | null>(null);
  const [selectedLegendItem, setSelectedLegendItem] = useState<DashboardLegendItem | null>(null);

  const explanationModalState = useMemo(
    () => ({
      visible: isExplanationVisible,
      setVisible: (visible: boolean) => {
        setExplanationVisible(visible);
        if (visible) analytics.logChartInteracted('safe_to_spend', 'explanation_open');
      },
      expandedSection,
      setExpandedSection: (section: DashboardExplanationSection | null) => {
        setExpandedSection(section);
        if (section) analytics.logChartInteracted('safe_to_spend', `explanation_expand_${section}`);
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

  const { strings } = AppConfig;

  const recentJournalEntries = useRecentJournalEntries({
    workplaceId,
    pageSize: AppConfig.pagination.dashboardPageSize,
    emptyTitle: strings.dashboard.emptyTitle,
    emptySubtitle: strings.dashboard.emptySubtitle,
    initialItems: () => {
      const snapshot = snapshotService.getDashboardSnapshot<DashboardData>(workplaceId);
      const items = snapshot?.enrichedJournals || [];
      // Progressive Mount: Only show 5 items in the very first frame
      // to keep the view hierarchy light for the splash hide animation.
      return items.slice(0, 5);
    },
  });

  const plannedOccurrences = usePlannedOccurrences({
    workplaceId,
    allFlows: safeToSpendData?.report?.allFlows,
    accountMap: safeToSpendData?.accountMap,
    currencyCode: safeToSpendData?.currencyCode,
  });

  const hasJournalItems = recentJournalEntries.items.length > 0;
  // Log Journal List arrival
  useEffect(() => {
    if (hasJournalItems) {
      const duration = Math.round(getPerfNow() - (mountTimeRef.current || 0));
      appLogger.info(`[Dashboard] Journal List Items Loaded in ${duration}ms`);
    }
  }, [hasJournalItems]);

  // Log "Fully Ready" state
  useEffect(() => {
    if (isInitialized && hasSafeToSpendData && hasJournalItems) {
      const duration = Math.round(getPerfNow() - (mountTimeRef.current || 0));
      appLogger.info(`[Dashboard] Fully Ready in ${duration}ms`);
      appLogger.metric('Dashboard.FullyReady', duration);
    }
  }, [isInitialized, hasSafeToSpendData, hasJournalItems]);

  const sectionTitle = strings.dashboard.recentJournalEntries;

  return useMemo(
    () => ({
      hasCompletedOnboarding,
      showSafeToSpendChart,
      recentJournalEntries,
      plannedOccurrences,
      journalSectionTitle: sectionTitle,
      safeToSpendData,
      explanationModalState,
      legendModalState,
    }),
    [
      hasCompletedOnboarding,
      showSafeToSpendChart,
      recentJournalEntries,
      plannedOccurrences,
      sectionTitle,
      safeToSpendData,
      explanationModalState,
      legendModalState,
    ],
  );
}
