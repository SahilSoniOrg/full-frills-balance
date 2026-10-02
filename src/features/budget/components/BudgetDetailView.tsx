import { JournalEntryListView } from '@/src/components/journal/JournalEntryListView';
import { AppButton, AppText, EmptyStateView, LoadingView } from '@/src/components/core';
import { ScreenSectionHeader } from '@/src/components/shared/ScreenSectionHeader';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Spacing } from '@/src/constants';
import { JournalListModals } from '@/src/features/journal';
import { StyleSheet, View } from 'react-native';
import { BudgetDetailHeader } from './BudgetDetailHeader';
import { BudgetSetupDisclosure } from './BudgetSetupDisclosure';
import { BudgetSpendingInsights } from './BudgetSpendingInsights';
import type { BudgetDetailViewModel } from '../hooks/useBudgetDetailViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import { Column, Row } from '@/src/design-system';

export function BudgetDetailView({
  chrome,
  ...vm
}: BudgetDetailViewModel & { chrome: ScreenNavChrome }) {
  const { budget, usage, periodRange } = vm;

  if (vm.isLoading) {
    return (
      <ScreenWithChrome chrome={chrome}>
        <LoadingView loading={true} text={AppConfig.strings.budget.loading} size="large" />
      </ScreenWithChrome>
    );
  }

  if (vm.isMissing || !budget || !usage || !periodRange) {
    return (
      <ScreenWithChrome chrome={chrome}>
        <EmptyStateView title="Budget not found" subtitle="This budget may have been deleted." />
        <AppButton variant="ghost" onPress={AppNavigation.back}>
          Go back
        </AppButton>
      </ScreenWithChrome>
    );
  }

  return (
    <ScreenWithChrome
      chrome={chrome}
      footer={
        !vm.isSelectionModeActive ? (
          <Column paddingHorizontal="lg" paddingVertical="sm">
            <AppButton variant="primary" onPress={vm.onAddExpense}>
              Add expense
            </AppButton>
          </Column>
        ) : undefined
      }
    >
      <View style={styles.container}>
        <JournalEntryListView
          items={vm.items}
          isLoading={vm.isLoadingActivity}
          isLoadingMore={vm.isLoadingMore}
          onEndReached={vm.onEndReached}
          emptyTitle={AppConfig.strings.budget.activityEmptyTitle}
          emptySubtitle={AppConfig.strings.budget.activityEmptySubtitle}
          selectedIds={vm.selectedIds}
          onLongPressItem={vm.onLongPressItem}
          isSelectionModeActive={vm.isSelectionModeActive}
          selectionChrome={vm.selectionChrome}
          ListHeaderComponent={
            <Column gap="lg" marginBottom="md">
              <BudgetDetailHeader
                budget={budget}
                usage={usage}
                periodLabel={vm.periodLabel}
                periodRange={periodRange}
                isCurrentMonth={vm.isCurrentMonth}
                chartData={vm.chartData}
                prevMonth={vm.prevMonth}
                nextMonth={vm.nextMonth}
                resetToToday={vm.resetToToday}
              />
              <BudgetSpendingInsights
                chartData={vm.chartData}
                isLoading={vm.isLoadingInsights}
                error={vm.insightsError}
                previousUsageError={vm.previousUsageError}
                onRetry={vm.onRetryInsights}
                currencyCode={budget.currencyCode}
                expenseAccounts={vm.expenseAccounts}
                previousUsage={vm.previousUsage}
                previousPeriodRange={vm.previousPeriodRange}
                onPreviousPeriod={vm.prevMonth}
                onFilterCategory={vm.onFilterCategory}
                activityCategory={vm.activityCategory}
              />
              <BudgetSetupDisclosure
                budget={budget}
                periodRange={periodRange}
                scopeAccounts={vm.scopeAccounts}
                fundingAccounts={vm.fundingAccounts}
                isLoadingScope={vm.isLoadingScope}
                isLoadingFunding={vm.isLoadingFunding}
                onEdit={vm.handleEdit}
              />
              <ScreenSectionHeader
                title={AppConfig.strings.budget.activityTitle}
                subtitle={
                  vm.activityCategory
                    ? `Recorded entries for ${vm.activityCategory.name}`
                    : 'Recorded entries in the selected period'
                }
              />
              {vm.activityCategory && (
                <Row justify="space-between" align="center" gap="sm" flexWrap="wrap">
                  <AppText variant="caption" color="secondary">
                    Summary totals above cover the whole budget.
                  </AppText>
                  <AppButton
                    variant="secondary"
                    size="sm"
                    onPress={() => vm.onFilterCategory(null)}
                  >
                    Show all activity
                  </AppButton>
                </Row>
              )}
            </Column>
          }
          contentContainerStyle={styles.listContent}
        />
        {vm.modals ? <JournalListModals {...vm.modals} /> : null}
      </View>
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
});
