import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { Spacing } from '@/src/constants';
import { DashboardHeader } from '@/src/features/dashboard/components/DashboardHeader';
import { DashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { JournalListView, PlannedPaymentsSection } from '@/src/features/journal';

import { Inset, Page, Skeleton, Stack } from '@/src/design-system';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeToSpendCard } from './SafeToSpendCard';
import { useSafeToSpendView } from '../hooks/useSafeToSpendView';
import { SafeToSpendExplanationModal } from './SafeToSpendExplanationModal';
import { SafeToSpendLegendModal } from './SafeToSpendLegendModal';

export function DashboardScreenView({
  isInitialized,
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
}: DashboardViewModel & { listRef?: React.RefObject<any> }) {
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
    ...(safeToSpendData || ({} as any)),
    uiState,
    isLoading: !isInitialized,
  });
  if (!isInitialized) {
    return (
      <Page edges={['top']}>
        <Inset space="lg">
          <Stack gap="xl">
            <Skeleton height={60} radius="lg" />
            <Skeleton height={180} radius="xl" />
            <Stack gap="md">
              <Skeleton width={150} height={20} />
              <Stack gap="sm">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} height={50} radius="lg" />
                ))}
              </Stack>
            </Stack>
          </Stack>
        </Inset>
      </Page>
    );
  }

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
            {safeToSpendData && (
              <View style={{ zIndex: 10 }}>
                <SafeToSpendCard
                  {...safeToSpendData}
                  viewModel={safeToSpendViewModel}
                  onInfoPress={() => safeToSpendViewModel.setInfoVisible(true)}
                  onLegendPress={safeToSpendViewModel.setSelectedLegendItem}
                  isLoading={!isInitialized}
                  isPrivacyMode={isPrivacyMode}
                />
              </View>
            )}
            <View style={{ zIndex: 1 }}>
              <PlannedPaymentsSection
                items={listViewProps.plannedJournals || []}
                onItemPress={listViewProps.onPlannedJournalPress}
                isPrivacyMode={isPrivacyMode}
              />
            </View>
            <ScreenSectionHeader
              title={transactionSectionTitle}
              style={styles.transactionSectionTitle}
            />
          </View>
        }
        fab={fab}
      />
      <SafeToSpendExplanationModal
        visible={explanationModalState.visible}
        onClose={() => explanationModalState.setVisible(false)}
        viewModel={safeToSpendViewModel}
        expandedSection={explanationModalState.expandedSection}
        setExpandedSection={explanationModalState.setExpandedSection}
      />

      <SafeToSpendLegendModal
        visible={!!legendModalState.selectedItem}
        onClose={() => legendModalState.setSelectedItem(null)}
        type={legendModalState.selectedItem}
        viewModel={safeToSpendViewModel}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    marginTop: Spacing.sm,
  },
  transactionSectionTitle: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
});
