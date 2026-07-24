import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { Inset } from '@/src/design-system';
import { DashboardHeader } from '@/src/features/dashboard/components/DashboardHeader';
import { DashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { JournalListView, PlannedPaymentsSection } from '@/src/features/journal';
import { SafeToSpendDashboard } from '@/src/services/simulation/SafeToSpendReadModel';
import React from 'react';
import { FlatList, View } from 'react-native';
import { useSafeToSpendView } from '../hooks/useSafeToSpendView';
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

  const enrichedPlannedJournals = React.useMemo(() => {
    const planned = listViewProps.plannedJournals || [];
    if (!safeToSpendData?.report?.allFlows) return planned;

    const liabilityOutflows = safeToSpendData.report.allFlows.filter(
      f => f.kind === 'OUTFLOW' && f.origin === 'LIABILITY',
    );

    const syntheticJournals = liabilityOutflows.map((f: any, index) => {
      const todayMs = new Date().setHours(0, 0, 0, 0);
      const dateMs = todayMs + f.dayOffset * 24 * 60 * 60 * 1000;
      const payFromAccount = safeToSpendData.accountMap?.get(f.accountId);
      const creditCardAccount = safeToSpendData.accountMap?.get(f.referenceId);
      const payFromAccountName = payFromAccount?.name || 'Checking';

      return {
        id: `synthetic_cc_${f.referenceId}_${f.dayOffset}_${index}`,
        journalDate: dateMs,
        description: f.label,
        totalAmount: f.amount,
        currencyCode: safeToSpendData.currencyCode || 'INR',
        displayType: 'EXPENSE',
        status: 'PLANNED',
        accounts: [
          {
            id: f.accountId,
            name: payFromAccountName,
            accountType: 'ASSET',
            role: 'SOURCE',
            icon: payFromAccount?.icon || 'wallet',
          },
          {
            id: f.referenceId,
            name: creditCardAccount?.name || f.label,
            accountType: 'LIABILITY',
            role: 'DESTINATION',
            icon: creditCardAccount?.icon || 'creditCard',
          },
        ],
        createdAt: dateMs,
        updatedAt: dateMs,
        version: 1,
      } as any;
    });

    return [...planned, ...syntheticJournals];
  }, [listViewProps.plannedJournals, safeToSpendData]);

  if (!hasCompletedOnboarding) {
    return null;
  }

  return (
    <>
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
              />
            </View>
            <View style={{ zIndex: 1 }}>
              <PlannedPaymentsSection
                items={enrichedPlannedJournals}
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
      />
    </>
  );
}
