import { AppConfig } from '@/src/constants';
import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { useOnboardingSession } from '@/src/contexts/app-shell/AppOnboardingProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useDashboardPreferences } from '@/src/hooks/useDashboardPreferences';
import type { ListSelectionChrome } from '@/src/components/shared/SelectionActionBar';
import {
  useJournalEntryList,
  useJournalsBulkOperations,
  type JournalListModalsProps,
} from '@/src/features/journal';
import { JournalId } from '@/src/types/ids';
import { JournalListItem } from '@/src/types/ui';
import { PlannedOccurrencesResult, usePlannedOccurrences } from '@/src/features/planned-payments';
import { useDashboardFeatureActions } from '@/src/features/dashboard/hooks/useDashboardFeatureActions';
import { useObservable } from '@/src/hooks/useObservable';
import { safeToSpendReadModel } from '@/src/services/simulation/SafeToSpendReadModel';
import type { SafeToSpendDashboard } from '@/src/services/simulation/safeToSpendDashboardProjection';
import {
  restoreSafeToSpendPaintSnapshot,
  type SafeToSpendPaintSnapshot,
} from '@/src/services/simulation/safeToSpendSnapshotWriter';
import type { DashboardData } from '@/src/services/ReactiveDataService';
import { logger as appLogger } from '@/src/utils/logger';
import { snapshotService } from '@/src/utils/SnapshotService';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY } from 'rxjs';

export interface RecentJournalEntries {
  items: JournalListItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  loadingMoreText: string;
  emptyTitle: string;
  emptySubtitle: string;
  onEndReached?: () => void;
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  selectionChrome: ListSelectionChrome;
  modals?: JournalListModalsProps;
}

export interface DashboardViewModel {
  hasCompletedOnboarding: boolean;
  showSafeToSpendChart: boolean;
  recentJournalEntries: RecentJournalEntries;
  plannedOccurrences: PlannedOccurrencesResult;
  journalSectionTitle: string;
  safeToSpendData: SafeToSpendDashboard | SafeToSpendPaintSnapshot | null;
  safeToSpendDetailsReady: boolean;
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
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const { isInitialized, isAppReady } = useAppReady();
  const { hasCompletedOnboarding } = useOnboardingSession();
  const { showSafeToSpendChart } = useDashboardPreferences();

  const mountTimeRef = useRef<number>(0);
  useEffect(() => {
    mountTimeRef.current = performance.now();
  }, []);

  const { data: safeToSpendData } = useObservable<
    SafeToSpendDashboard | SafeToSpendPaintSnapshot | null
  >(
    () => (isAppReady ? safeToSpendReadModel.forWorkplace(workplaceId).watch() : EMPTY),
    [workplaceId, isAppReady],
    () => {
      const cached = snapshotService.getCustomSnapshotWithMetadata<
        SafeToSpendPaintSnapshot | SafeToSpendDashboard
      >(workplaceId, 'safe_to_spend');
      return cached ? restoreSafeToSpendPaintSnapshot(cached.data, cached) : null;
    },
  );

  const visibleSafeToSpendData = useMemo(() => {
    if (!safeToSpendData || safeToSpendData.workplaceId !== workplaceId) return null;
    return safeToSpendData.currencyCode !== defaultCurrencyCode
      ? { ...safeToSpendData, quality: 'stale' as const }
      : safeToSpendData;
  }, [safeToSpendData, workplaceId, defaultCurrencyCode]);
  const hasSafeToSpendData = !!visibleSafeToSpendData;
  const safeToSpendDetailsReady =
    !!visibleSafeToSpendData &&
    !('snapshotKind' in visibleSafeToSpendData) &&
    visibleSafeToSpendData.quality === 'ready' &&
    visibleSafeToSpendData.currencyCode === defaultCurrencyCode;
  const [isExplanationVisible, setExplanationVisible] = useState(false);
  const [expandedSection, setExpandedSection] = useState<DashboardExplanationSection | null>(null);
  const [selectedLegendItem, setSelectedLegendItem] = useState<DashboardLegendItem | null>(null);

  const { trackExplanationVisible, trackExplanationSection, trackViewed } =
    useDashboardFeatureActions();

  const viewedWorkplaceRef = useRef<string | null>(null);
  const liveSafeToSpend =
    visibleSafeToSpendData && !('snapshotKind' in visibleSafeToSpendData)
      ? visibleSafeToSpendData
      : null;
  useEffect(() => {
    if (!liveSafeToSpend || viewedWorkplaceRef.current === liveSafeToSpend.workplaceId) return;
    viewedWorkplaceRef.current = liveSafeToSpend.workplaceId;
    trackViewed({
      quality: liveSafeToSpend.quality ?? 'ready',
      isOverCommitted: liveSafeToSpend.summary.shortfall > 0,
      hasUnvalued: !!liveSafeToSpend.hasUnvaluedEntries,
    });
  }, [liveSafeToSpend, trackViewed]);

  const explanationModalState = useMemo(
    () => ({
      visible: isExplanationVisible,
      setVisible: (visible: boolean) => {
        setExplanationVisible(visible);
        trackExplanationVisible(visible);
      },
      expandedSection,
      setExpandedSection: (section: DashboardExplanationSection | null) => {
        setExpandedSection(section);
        if (section) trackExplanationSection(section);
      },
    }),
    [isExplanationVisible, expandedSection, trackExplanationVisible, trackExplanationSection],
  );

  const legendModalState = useMemo(
    () => ({
      selectedItem: selectedLegendItem,
      setSelectedItem: setSelectedLegendItem,
    }),
    [selectedLegendItem],
  );

  const { strings } = AppConfig;

  const journalListCore = useJournalEntryList({
    workplaceId,
    pageSize: AppConfig.pagination.dashboardPageSize,
    initialItems: () => {
      const snapshot = snapshotService.getDashboardSnapshot<DashboardData>(workplaceId);
      const items = snapshot?.enrichedJournals || [];
      return items.slice(0, 5);
    },
    shareTitle: 'Transactions Report',
    paginationPolicy: 'default',
  });
  const journalBulk = useJournalsBulkOperations({
    workplaceId,
    journals: journalListCore.journals,
    selection: journalListCore,
    onShareSelected: journalListCore.onShareSelected,
  });
  const recentJournalEntries = useMemo<RecentJournalEntries>(
    () => ({
      items: journalListCore.items,
      isLoading: journalListCore.isLoading,
      isLoadingMore: journalListCore.isLoadingMore,
      loadingMoreText: strings.common.loading,
      emptyTitle: strings.dashboard.emptyTitle,
      emptySubtitle: strings.dashboard.emptySubtitle,
      onEndReached: journalListCore.onEndReached,
      selectedIds: journalListCore.selectedIds,
      isSelectionModeActive: journalListCore.isSelectionModeActive,
      onLongPressItem: journalListCore.onLongPressItem,
      selectionChrome: journalBulk.selectionChrome,
      modals: journalBulk.modals,
    }),
    [
      journalListCore.items,
      journalListCore.isLoading,
      journalListCore.isLoadingMore,
      journalListCore.onEndReached,
      journalListCore.selectedIds,
      journalListCore.isSelectionModeActive,
      journalListCore.onLongPressItem,
      journalBulk.selectionChrome,
      journalBulk.modals,
      strings.common.loading,
      strings.dashboard.emptyTitle,
      strings.dashboard.emptySubtitle,
    ],
  );

  const currentReadyDashboard =
    safeToSpendDetailsReady && visibleSafeToSpendData && !('snapshotKind' in visibleSafeToSpendData)
      ? visibleSafeToSpendData
      : null;
  const plannedOccurrences = usePlannedOccurrences({
    workplaceId,
    allFlows: currentReadyDashboard?.report.allFlows,
    accountMap: currentReadyDashboard?.accountMap,
    currencyCode: visibleSafeToSpendData?.currencyCode,
  });

  const hasJournalItems = recentJournalEntries.items.length > 0;
  useEffect(() => {
    if (isInitialized && hasSafeToSpendData && hasJournalItems) {
      const duration = Math.round(performance.now() - (mountTimeRef.current || 0));
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
      safeToSpendData: visibleSafeToSpendData,
      safeToSpendDetailsReady,
      explanationModalState,
      legendModalState,
    }),
    [
      hasCompletedOnboarding,
      showSafeToSpendChart,
      recentJournalEntries,
      plannedOccurrences,
      sectionTitle,
      visibleSafeToSpendData,
      safeToSpendDetailsReady,
      explanationModalState,
      legendModalState,
    ],
  );
}
