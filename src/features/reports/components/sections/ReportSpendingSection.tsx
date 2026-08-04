import { CalendarHeatmap } from '@/src/components/charts/CalendarHeatmap';
import { HeatmapChart } from '@/src/components/charts/HeatmapChart';
import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { BreakdownDonutCard } from '@/src/features/reports/components/BreakdownDonutCard';
import { ReportChartCard } from '@/src/features/reports/components/ReportChartCard';
import { ReportNoData } from '@/src/features/reports/components/ReportNoData';
import { ReportSpendingTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import { StyleSheet } from 'react-native';

interface ReportSpendingSectionProps {
  vm: ReportSpendingTabVm;
  chartWidth: number;
  formatMoney: (amount: number) => string;
}

export function ReportSpendingSection({ vm, chartWidth, formatMoney }: ReportSpendingSectionProps) {
  const {
    expenseViewState,
    expenseCategoryViewState,
    expandedExpenses,
    toggleExpenseExpansion,
    incomeCategoryViewState,
    spendingHeatmap,
    calendarHeatmap,
    onLegendRowPress,
    expandedExpenseCategories,
    toggleExpenseCategoryExpansion,
    expandedIncomeCategories,
    toggleIncomeCategoryExpansion,
    onCategoryPress,
    targetCurrency,
  } = vm;

  return (
    <>
      <ReportChartCard title={AppConfig.strings.reports.spendingByAccount}>
        {expenseViewState.hasData ? (
          <BreakdownDonutCard
            donutData={expenseViewState.donutData}
            legendRows={expenseViewState.legendRows}
            totalCount={expenseViewState.totalCount}
            showExpansionButton={expenseViewState.showExpansionButton}
            expanded={expandedExpenses}
            onToggleExpansion={toggleExpenseExpansion}
            onLegendRowPress={onLegendRowPress}
            currencyCode={targetCurrency}
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
            expanded={expandedExpenseCategories}
            onToggleExpansion={toggleExpenseCategoryExpansion}
            onLegendRowPress={onCategoryPress}
            currencyCode={targetCurrency}
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
            expanded={expandedIncomeCategories}
            onToggleExpansion={toggleIncomeCategoryExpansion}
            onLegendRowPress={onCategoryPress}
            currencyCode={targetCurrency}
          />
        ) : (
          <ReportNoData />
        )}
      </ReportChartCard>

      <ReportChartCard title={AppConfig.strings.reports.spendingHeatmap}>
        <HeatmapChart
          data={spendingHeatmap}
          width={chartWidth}
          currency={targetCurrency}
          formatValue={formatMoney}
        />
        <AppText variant="caption" color="secondary" style={styles.chartSubtitle}>
          {AppConfig.strings.reports.heatmapSubtitle}
        </AppText>
      </ReportChartCard>

      <ReportChartCard title={AppConfig.strings.reports.activityCalendar}>
        <CalendarHeatmap
          data={calendarHeatmap}
          width={chartWidth}
          currency={targetCurrency}
          formatValue={formatMoney}
        />
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
