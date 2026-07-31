import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { Inset } from '@/src/design-system';
import { DashboardHeader } from '@/src/features/dashboard/components/DashboardHeader';
import { DashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { JournalListView, PlannedPaymentsSection } from '@/src/features/journal';
import { SafeToSpendDashboard } from '@/src/services/simulation/SafeToSpendReadModel';
import React from 'react';
import { FlatList, View } from 'react-native';
import { useSafeToSpendView } from '../hooks/useSafeToSpendView';
import {
  mapLiabilityFlowsToPlannedOccurrences,
  mergePlannedOccurrences,
} from '../mappers/plannedOccurrenceMapper';
import { SafeToSpendCard } from './SafeToSpendCard';
import { SafeToSpendExplanationModal } from './SafeToSpendExplanationModal';
import { SafeToSpendLegendModal } from './SafeToSpendLegendModal';

export function DashboardScreenView({
  hasCompletedOnboarding,
  listViewProps,
  headerProps,
  fab,
  safeToSpendData,
  transactionSectionTitle,
  listRef,
  explanationModalState,
  legendModalState,
  isPrivacyMode,
  showSafeToSpendChart,
}: DashboardViewModel & { listRef?: React.RefObject<FlatList | null> }) {
  const uiState = React.useMemo(
    () => ({
      isInfoVisible: explanationModalState.visible,
      setInfoVisible: explanationModalState.setVisible,
      expandedSection: explanationModalState.expandedSection,
      setExpandedSection: explanationModalState.setExpandedSection,
      selectedLegendItem: legendModalState.selectedItem,
      setSelectedLegendItem: legendModalState.setSelectedItem,
      isPrivacyMode,
    }),
    [
      explanationModalState.visible,
      explanationModalState.setVisible,
      explanationModalState.expandedSection,
      explanationModalState.setExpandedSection,
      legendModalState.selectedItem,
      legendModalState.setSelectedItem,
      isPrivacyMode,
    ],
  );

  const safeToSpendViewModel = useSafeToSpendView({
    // Provide defaults for all required fields when data is null to avoid dangerous casting
    summary: safeToSpendData?.summary ?? {
      safeToSpend: 0,
      shortfall: 0,
      trajectoryMinBalance: 0,
      safeDaysCount: null,
      totalFutureInflow: 0,
      totalPlannedInflow: 0,
      totalPlannedOutflow: 0,
      totalCommittedPlanned: 0,
      firstMajorInflowDay: null,
    },
    report: safeToSpendData?.report ?? {
      allFlows: [],
      liabilities: {
        total: 0,
        totalCreditCard: 0,
        totalOther: 0,
        committed: 0,
        committedCreditCard: 0,
        committedOther: 0,
      },
      budget: { currentMonthRemaining: 0, nextMonthProjected: 0, nextMonthDays: 0 },
      summary: {
        firstMajorInflowDay: null,
        totalFutureInflow: 0,
        totalPlannedInflow: 0,
        totalPlannedOutflow: 0,
        totalCommittedPlanned: 0,
      },
    },
    accountSummaries: safeToSpendData?.accountSummaries ?? [],
    totalLiquidAssets: safeToSpendData?.totalLiquidAssets ?? 0,
    currencyCode: safeToSpendData?.currencyCode ?? '',
    liquidAssetSubtypes: safeToSpendData?.liquidAssetSubtypes ?? [],
    dailyBudgetBurn: safeToSpendData?.dailyBudgetBurn ?? 0,
    projection: safeToSpendData?.projection ?? {
      history: [],
      projection: [],
      safeDaysCount: null,
      safeToSpend: 0,
    },
    accountMap: safeToSpendData?.accountMap ?? new Map(),
    safeToSpendDays: safeToSpendData?.safeToSpendDays ?? 0,
    uiState,
    isLoading: !safeToSpendData,
  });

  const plannedOccurrences = React.useMemo(() => {
    const planned = listViewProps.plannedJournals || [];
    if (!safeToSpendData?.report?.allFlows) {
      return mergePlannedOccurrences(planned, []);
    }

    const simulated = mapLiabilityFlowsToPlannedOccurrences({
      allFlows: safeToSpendData.report.allFlows,
      accountMap: safeToSpendData.accountMap ?? new Map(),
      currencyCode: safeToSpendData.currencyCode || 'INR',
    });

    return mergePlannedOccurrences(planned, simulated);
  }, [listViewProps.plannedJournals, safeToSpendData]);

  if (!hasCompletedOnboarding) {
    return null;
  }

  return (
    <View testID="dashboard-screen" style={{ flex: 1 }}>
      <JournalListView
        {...listViewProps}
        ref={listRef}
        showBack={false}
        isPrivacyMode={isPrivacyMode}
        listHeader={
          <View style={{ zIndex: 10 }}>
            <DashboardHeader {...headerProps} />
            <View style={{ zIndex: 10 }}>
              <SafeToSpendCard
                {...(safeToSpendData || ({} as unknown as SafeToSpendDashboard))}
                viewModel={safeToSpendViewModel}
                onInfoPress={() => safeToSpendViewModel.setInfoVisible(true)}
                onLegendPress={safeToSpendViewModel.setSelectedLegendItem}
                isLoading={!safeToSpendData}
                isPrivacyMode={isPrivacyMode}
                showChart={showSafeToSpendChart}
              />
            </View>
            <View style={{ zIndex: 1 }}>
              <PlannedPaymentsSection
                items={plannedOccurrences}
                onItemPress={listViewProps.onPlannedJournalPress}
              />
            </View>
            <Inset horizontal="lg" vertical="lg">
              <ScreenSectionHeader title={transactionSectionTitle} />
            </Inset>
          </View>
        }
        fab={fab}
      />

      <SafeToSpendExplanationModal
        visible={uiState.isInfoVisible}
        onClose={() => uiState.setInfoVisible(false)}
        expandedSection={uiState.expandedSection}
        setExpandedSection={uiState.setExpandedSection}
        viewModel={safeToSpendViewModel}
      />

      <SafeToSpendLegendModal
        visible={!!uiState.selectedLegendItem}
        onClose={() => uiState.setSelectedLegendItem(null)}
        type={uiState.selectedLegendItem}
        viewModel={safeToSpendViewModel}
        onRequestExplanation={() => {
          uiState.setSelectedLegendItem(null);
          uiState.setInfoVisible(true);
        }}
      />
    </View>
  );
}
