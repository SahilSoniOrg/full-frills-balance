import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { JournalEntryListView } from '@/src/components/common/JournalEntryListView';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { Size, Spacing } from '@/src/constants';
import { Inset } from '@/src/design-system';
import { JournalListModals } from '@/src/features/journal';
import { DashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { SafeToSpendDashboard } from '@/src/services/simulation/safeToSpendDashboardProjection';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeToSpendView } from '../hooks/useSafeToSpendView';
import { PlannedPaymentsSection } from '@/src/features/dashboard/components/PlannedPaymentsSection';
import { SafeToSpendCard } from './SafeToSpendCard';
import { SafeToSpendExplanationModal } from './SafeToSpendExplanationModal';
import { SafeToSpendLegendModal } from './SafeToSpendLegendModal';

export function DashboardScreenView({
  hasCompletedOnboarding,
  recentJournalEntries,
  plannedOccurrences,
  safeToSpendData,
  journalSectionTitle,
  listRef,
  explanationModalState,
  legendModalState,
  showSafeToSpendChart,
  chrome,
}: DashboardViewModel & { listRef?: React.RefObject<FlatList | null>; chrome: TabScreenChrome }) {
  const uiState = React.useMemo(
    () => ({
      isInfoVisible: explanationModalState.visible,
      setInfoVisible: explanationModalState.setVisible,
      expandedSection: explanationModalState.expandedSection,
      setExpandedSection: explanationModalState.setExpandedSection,
      selectedLegendItem: legendModalState.selectedItem,
      setSelectedLegendItem: legendModalState.setSelectedItem,
    }),
    [
      explanationModalState.visible,
      explanationModalState.setVisible,
      explanationModalState.expandedSection,
      explanationModalState.setExpandedSection,
      legendModalState.selectedItem,
      legendModalState.setSelectedItem,
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

  const selectionChrome = useMemo(
    () => ({
      exitSelectionMode: recentJournalEntries.exitSelectionMode,
      selectAll: recentJournalEntries.selectAll,
      clearItems: recentJournalEntries.clearItems,
      onShareSelected: recentJournalEntries.onShareSelected,
      actions: recentJournalEntries.actions,
    }),
    [
      recentJournalEntries.exitSelectionMode,
      recentJournalEntries.selectAll,
      recentJournalEntries.clearItems,
      recentJournalEntries.onShareSelected,
      recentJournalEntries.actions,
    ],
  );

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
  } = recentJournalEntries;

  return (
    <ScreenWithChrome testID="dashboard-screen" edges={['top']} chrome={chrome}>
      <View style={styles.container}>
        <JournalEntryListView
          ref={listRef}
          items={items}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          loadingText={loadingText}
          loadingMoreText={loadingMoreText}
          emptyTitle={emptyTitle}
          emptySubtitle={emptySubtitle}
          onEndReached={onEndReached}
          selectedIds={selectedIds}
          onLongPressItem={onLongPressItem}
          isSelectionModeActive={isSelectionModeActive}
          selectionChrome={selectionChrome}
          contentContainerStyle={styles.listContent}
          style={styles.feed}
          ListHeaderComponent={
            <View style={{ zIndex: 10 }}>
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
                />
              </View>
              <Inset horizontal="lg" vertical="lg">
                <ScreenSectionHeader title={journalSectionTitle} />
              </Inset>
            </View>
          }
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

        {recentJournalEntries.modals ? (
          <JournalListModals {...recentJournalEntries.modals} />
        ) : null}
      </View>
    </ScreenWithChrome>
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
    paddingHorizontal: Spacing.lg,
    // Nav already separates title from content; keep a small breath only.
    paddingTop: Spacing.sm,
    paddingBottom: Size.buttonLg + Spacing.xl,
  },
});
