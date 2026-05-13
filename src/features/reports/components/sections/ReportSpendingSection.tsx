import { CalendarHeatmap } from '@/src/components/charts/CalendarHeatmap';
import { HeatmapChart } from '@/src/components/charts/HeatmapChart';
import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { BreakdownDonutCard } from '@/src/features/reports/components/BreakdownDonutCard';
import { ReportChartCard } from '@/src/features/reports/components/ReportChartCard';
import { ReportNoData } from '@/src/features/reports/components/ReportNoData';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import React from 'react';
import { StyleSheet } from 'react-native';

interface ReportSpendingSectionProps {
  vm: ReportsViewModel;
  chartWidth: number;
}

export function ReportSpendingSection({ vm, chartWidth }: ReportSpendingSectionProps) {
  const {
    expenseCategoryViewState,
    expenseDonutData,
    legendRows,
    totalExpenseCount,
    showExpenseExpansionButton,
    expandedExpenses,
    toggleExpenseExpansion,
    incomeCategoryViewState,
    spendingHeatmap,
    calendarHeatmap,
    onLegendRowPress,
  } = vm;

  return (
    <>
      <ReportChartCard title={AppConfig.strings.reports.spendingByAccount}>
        {expenseCategoryViewState.hasData ? (
          <BreakdownDonutCard
            donutData={expenseDonutData}
            legendRows={legendRows}
            totalCount={totalExpenseCount}
            showExpansionButton={showExpenseExpansionButton}
            expanded={expandedExpenses}
            onToggleExpansion={toggleExpenseExpansion}
            onLegendRowPress={onLegendRowPress}
            currencyCode={vm.targetCurrency}
          />
        ) : (
          <ReportNoData />
        )}
      </ReportChartCard>

      <ReportChartCard title={AppConfig.strings.reports.spendingByCategory}>
        {expenseCategoryViewState.hasData ? (
          <BreakdownDonutCard
            donutData={expenseCategoryViewState.donutData}
            legendRows={expenseCategoryViewState.legendRows}
            totalCount={expenseCategoryViewState.totalCount}
            showExpansionButton={expenseCategoryViewState.showExpansionButton}
            expanded={vm.expandedExpenseCategories}
            onToggleExpansion={vm.toggleExpenseCategoryExpansion}
            onLegendRowPress={vm.onCategoryPress}
            currencyCode={vm.targetCurrency}
          />
        ) : (
          <ReportNoData />
        )}
      </ReportChartCard>

      <ReportChartCard title={AppConfig.strings.reports.incomeByCategory}>
        {incomeCategoryViewState.hasData ? (
          <BreakdownDonutCard
            donutData={incomeCategoryViewState.donutData}
            legendRows={incomeCategoryViewState.legendRows}
            totalCount={incomeCategoryViewState.totalCount}
            showExpansionButton={incomeCategoryViewState.showExpansionButton}
            expanded={vm.expandedIncomeCategories}
            onToggleExpansion={vm.toggleIncomeCategoryExpansion}
            onLegendRowPress={vm.onCategoryPress}
            currencyCode={vm.targetCurrency}
          />
        ) : (
          <ReportNoData />
        )}
      </ReportChartCard>

      <ReportChartCard title={AppConfig.strings.reports.spendingHeatmap}>
        <HeatmapChart data={spendingHeatmap} width={chartWidth} currency={vm.targetCurrency} />
        <AppText variant="caption" color="secondary" style={styles.chartSubtitle}>
          {AppConfig.strings.reports.heatmapSubtitle}
        </AppText>
      </ReportChartCard>

      <ReportChartCard title={AppConfig.strings.reports.activityCalendar}>
        <CalendarHeatmap data={calendarHeatmap} width={chartWidth} currency={vm.targetCurrency} />
      </ReportChartCard>
    </>
  );
}

const styles = StyleSheet.create({
  chartSubtitle: {
    marginTop: Spacing.md,
    textAlign: 'center',
  },
});
