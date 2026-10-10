import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { JournalEntryListView } from '@/src/components/journal/JournalEntryListView';
import { AppButton, AppText, EmptyStateView, LoadingView } from '@/src/components/core';
import { ScreenSectionHeader } from '@/src/components/shared/ScreenSectionHeader';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { JournalListModals } from '@/src/features/journal';
import { AppNavigation } from '@/src/utils/navigation';
import { StyleSheet, View } from 'react-native';
import { BudgetDetailHeader } from './BudgetDetailHeader';
import { BudgetSetupDisclosure } from './BudgetSetupDisclosure';
import { BudgetSpendingChart } from './BudgetSpendingChart';
import { BudgetSpendingInsights } from './BudgetSpendingInsights';
import type { BudgetDetailViewModel } from '../hooks/useBudgetDetailViewModel';
import { presentBudgetPeriod } from '../helpers/budgetDetailPresentation';
import { getNow } from '@/src/utils/dateUtils';
import { Column, Row } from '@/src/design-system';

export function BudgetDetailView({
  chrome,
  ...vm
}: BudgetDetailViewModel & { chrome: ScreenNavChrome }) {
  const { budget, usage, periodRange } = vm;
  const strings = AppConfig.strings.budgetDetailRedesign;

  if (vm.isLoading) {
    return (
      <ScreenWithChrome chrome={chrome}>
        <LoadingView loading text={strings.loading} size="large" />
      </ScreenWithChrome>
    );
  }

  if (vm.isMissing || !budget || !usage || !periodRange) {
    return (
      <ScreenWithChrome chrome={chrome}>
        <EmptyStateView title={strings.missingTitle} subtitle={strings.missingSubtitle} />
        <AppButton
          variant="ghost"
          onPress={AppNavigation.back}
          accessibilityRole="button"
          accessibilityLabel={strings.goBack}
        >
          {strings.goBack}
        </AppButton>
      </ScreenWithChrome>
    );
  }

  const activityCount = vm.activityCategory
    ? vm.chartData?.categories.find(category => category.accountId === vm.activityCategory?.id)
        ?.entryCount
    : vm.chartData?.entryCount;
  const now = getNow();
  const period = presentBudgetPeriod(periodRange, usage, now);
  const activityCountLabel =
    activityCount === undefined
      ? undefined
      : vm.activityCategory
        ? strings.categoryActivityCount(vm.activityCategory.name, activityCount)
        : strings.allActivityCount(activityCount);

  return (
    <ScreenWithChrome chrome={chrome}>
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
            <Column gap="md" marginBottom="sm">
              <BudgetDetailHeader
                budget={budget}
                usage={usage}
                periodLabel={vm.periodLabel}
                period={period}
                isCurrentPeriod={vm.isCurrentPeriod}
                previousComparisonSpent={vm.previousComparisonSpent}
                previousPeriodRange={vm.previousPeriodRange}
                prevMonth={vm.prevMonth}
                nextMonth={vm.nextMonth}
                resetToToday={vm.resetToToday}
              />
              <BudgetSpendingChart
                chartData={vm.chartData}
                previousChartData={vm.previousChartData}
                usage={usage}
                currencyCode={budget.currencyCode}
                periodRange={periodRange}
                period={period}
                now={now}
                previousPeriodRange={vm.previousPeriodRange}
                isCurrentPeriod={vm.isCurrentPeriod}
                isLoading={vm.isLoadingInsights}
                error={vm.insightsError}
                onRetry={vm.onRetryInsights}
              />
              <BudgetSpendingInsights
                chartData={vm.chartData}
                isLoading={vm.isLoadingInsights}
                error={vm.insightsError}
                onRetry={vm.onRetryInsights}
                currencyCode={budget.currencyCode}
                expenseAccounts={vm.expenseAccounts}
                resolvedLeafCategoryCount={vm.resolvedLeafCategoryCount}
                onFilterCategory={vm.onFilterCategory}
                activityCategory={vm.activityCategory}
              />
              <BudgetSetupDisclosure
                budget={budget}
                fundingAccounts={vm.fundingAccounts}
                isLoadingFunding={vm.isLoadingFunding}
                onEdit={vm.handleEdit}
              />
              <ScreenSectionHeader
                title={strings.activity}
                action={
                  <Row align="center" gap="xs">
                    {activityCountLabel ? (
                      <AppText variant="caption" color="secondary">
                        {activityCountLabel}
                      </AppText>
                    ) : null}
                    {vm.activityCategory ? (
                      <PressScaleTouchable
                        onPress={() => vm.onFilterCategory(null)}
                        accessibilityRole="button"
                        accessibilityLabel={strings.clearActivityFilter}
                        hitSlop={8}
                        style={styles.clearFilterButton}
                      >
                        <AppText variant="body" color="secondary" weight="semibold">
                          ×
                        </AppText>
                      </PressScaleTouchable>
                    ) : null}
                  </Row>
                }
              />
            </Column>
          }
          contentContainerStyle={styles.listContent}
        />
        <JournalListModals {...vm.modals} />
      </View>
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Size.fab + Spacing.xl + Spacing.xxxl * 2,
  },
  clearFilterButton: {
    width: Size.buttonMd,
    height: Size.buttonMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
