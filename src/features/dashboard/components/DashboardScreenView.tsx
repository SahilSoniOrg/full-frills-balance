import { SelectionActionBar } from '@/src/components/common/SelectionActionBar';
import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { TransactionListView } from '@/src/components/common/TransactionListView';
import { FloatingActionButton } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { Inset } from '@/src/design-system';
import { DashboardHeader } from '@/src/features/dashboard/components/DashboardHeader';
import { DashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { PlannedPaymentsSection } from '@/src/features/dashboard/components/PlannedPaymentsSection';
import { SafeToSpendDashboard } from '@/src/services/simulation/SafeToSpendReadModel';
import { TransactionId } from '@/src/types/domain';
import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeToSpendView } from '../hooks/useSafeToSpendView';
import { SafeToSpendCard } from './SafeToSpendCard';
import { SafeToSpendExplanationModal } from './SafeToSpendExplanationModal';
import { SafeToSpendLegendModal } from './SafeToSpendLegendModal';

export function DashboardScreenView({
  hasCompletedOnboarding,
  isPrivacyMode,
  recentTransactions,
  plannedOccurrences,
  headerProps,
  fab,
  safeToSpendData,
  transactionSectionTitle,
  listRef,
  explanationModalState,
  legendModalState,
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

  if (!hasCompletedOnboarding) {
    return null;
  }

  const {
    items,
    isLoading,
    isLoadingMore,
    loadingText,
    loadingMoreText,
    emptyTitle,
    emptySubtitle,
    onEndReached,
    selectedIds,
    isSelectionModeActive,
    onLongPressItem,
    selectAll,
    clearItems,
    exitSelectionMode,
    onShareSelected,
  } = recentTransactions;

  const transactionCount = items.filter(i => i.type === 'transaction').length;

  return (
    <View testID="dashboard-screen" style={styles.container}>
      {isSelectionModeActive && (
        <Pressable style={StyleSheet.absoluteFill} onPress={exitSelectionMode} />
      )}

      <TransactionListView
        ref={listRef}
        items={items}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        loadingText={loadingText}
        loadingMoreText={loadingMoreText}
        emptyTitle={emptyTitle}
        emptySubtitle={emptySubtitle}
        onEndReached={onEndReached}
        isPrivacyMode={isPrivacyMode}
        selectedIds={selectedIds as Set<string> as Set<TransactionId>}
        onLongPressItem={onLongPressItem as (id: string) => void}
        isSelectionModeActive={isSelectionModeActive}
        contentContainerStyle={styles.listContent}
        style={styles.feed}
        ListHeaderComponent={
          <View style={{ zIndex: 10 }}>
            <DashboardHeader {...headerProps} />
            <View style={{ zIndex: 10 }}>
              <SafeToSpendCard
                {...(safeToSpendData || ({} as unknown as SafeToSpendDashboard))}
                viewModel={safeToSpendViewModel}
                onInfoPress={() => safeToSpendViewModel.setInfoVisible(true)}
                onLegendPress={safeToSpendViewModel.setSelectedLegendItem}
                isLoading={!safeToSpendData}
                showChart={showSafeToSpendChart}
              />
            </View>
            <View style={{ zIndex: 1 }}>
              <PlannedPaymentsSection
                items={plannedOccurrences.items}
                onItemPress={plannedOccurrences.onItemPress}
                isPrivacyMode={isPrivacyMode}
              />
            </View>
            <Inset horizontal="lg" vertical="lg">
              <ScreenSectionHeader title={transactionSectionTitle} />
            </Inset>
          </View>
        }
        ListFooterComponent={
          isSelectionModeActive ? (
            <Pressable style={{ height: 500 }} onPress={exitSelectionMode} />
          ) : undefined
        }
      />

      {fab && !isSelectionModeActive && (
        <FloatingActionButton
          onPress={fab.onPress}
          label={fab.label}
          placement={fab.placement}
          accessibilityLabel={fab.accessibilityLabel}
        />
      )}

      <SelectionActionBar
        selectedCount={selectedIds.size}
        totalCount={transactionCount}
        onClear={exitSelectionMode}
        onSelectAll={selectAll}
        onDeselectAll={clearItems}
        onShare={onShareSelected}
        isVisible={isSelectionModeActive}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  feed: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: Size.buttonLg + Spacing.xl,
  },
});
