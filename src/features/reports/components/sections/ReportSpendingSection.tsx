import { CalendarHeatmap } from '@/src/components/charts/CalendarHeatmap';
import { HeatmapChart } from '@/src/components/charts/HeatmapChart';
import { AppText } from '@/src/components/core';
import { ContextualExplanation } from '@/src/components/shared/ContextualExplanation';
import { AppConfig, Spacing } from '@/src/constants';
import { BreakdownDonutCard } from '@/src/features/reports/components/BreakdownDonutCard';
import { ReportChartCard } from '@/src/components/charts/ReportChartCard';
import { ReportNoData } from '@/src/features/reports/components/ReportNoData';
import { ReportSpendingTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import { formatDate } from '@/src/utils/dateUtils';
import { StyleSheet, View } from 'react-native';

interface ReportSpendingSectionProps {
  vm: ReportSpendingTabVm;
  chartWidth: number;
  explanationScope: {
    periodLabel: string;
    accountScopeLabel: string;
    hasUnvaluedEntries: boolean;
  };
}

export function ReportSpendingSection({
  vm,
  chartWidth,
  explanationScope,
}: ReportSpendingSectionProps) {
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
    targetCurrency,
  } = vm;
  const explanationContext = [
    { label: 'Period', value: explanationScope.periodLabel },
    { label: 'Accounts', value: explanationScope.accountScopeLabel },
  ];
  const explanationDataNotes = [
    'Amounts use the report currency; historical exchange rates are used when needed.',
    ...(explanationScope.hasUnvaluedEntries
      ? ['Some transactions could not be valued or linked to report accounts and may be omitted.']
      : []),
  ];

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
            drillDownKind="account"
            currencyCode={targetCurrency}
          />
        ) : (
          <ReportNoData />
        )}
      </ReportChartCard>

      <ReportChartCard
        title={AppConfig.strings.reports.spendingByCategory}
        testID="report-spending-by-category"
      >
        {expenseCategoryViewState.hasData ? (
          <BreakdownDonutCard
            donutData={expenseCategoryViewState.donutData}
            legendRows={expenseCategoryViewState.legendRows}
            totalCount={expenseCategoryViewState.totalCount}
            showExpansionButton={expenseCategoryViewState.showExpansionButton}
            expanded={expandedExpenseCategories}
            onToggleExpansion={toggleExpenseCategoryExpansion}
            onLegendRowPress={onLegendRowPress}
            drillDownKind="category"
            currencyCode={targetCurrency}
          />
        ) : (
          <ReportNoData />
        )}
      </ReportChartCard>

      <ReportChartCard
        title={AppConfig.strings.reports.incomeByCategory}
        testID="report-income-by-category"
      >
        {incomeCategoryViewState.hasData ? (
          <BreakdownDonutCard
            donutData={incomeCategoryViewState.donutData}
            legendRows={incomeCategoryViewState.legendRows}
            totalCount={incomeCategoryViewState.totalCount}
            showExpansionButton={incomeCategoryViewState.showExpansionButton}
            expanded={expandedIncomeCategories}
            onToggleExpansion={toggleIncomeCategoryExpansion}
            onLegendRowPress={onLegendRowPress}
            drillDownKind="category"
            currencyCode={targetCurrency}
          />
        ) : (
          <ReportNoData />
        )}
      </ReportChartCard>

      <ReportChartCard
        title={AppConfig.strings.reports.spendingHeatmap}
        headerContent={
          <View style={styles.explanationHeader}>
            <ContextualExplanation
              title="Spending heatmap"
              meaning="Each cell sums debit transaction amounts from selected income and expense accounts for one weekday and local hour. Weekdays run Monday to Sunday."
              interpretation="A darker cell means a larger total than lighter cells, scaled against the busiest cell. Color intensity is not linear and does not represent a transaction count."
              unit={targetCurrency}
              context={explanationContext}
              dataNotes={explanationDataNotes}
              testID="report-spending-heatmap-explanation"
            />
          </View>
        }
      >
        {spendingHeatmap.some(point => point.value > 0) ? (
          <>
            <HeatmapChart
              data={spendingHeatmap}
              width={chartWidth}
              currency={targetCurrency}
              onCellPress={vm.onHeatmapCellPress}
            />
            <AppText variant="caption" color="secondary" style={styles.chartSubtitle}>
              {AppConfig.strings.reports.heatmapSubtitle}
            </AppText>
          </>
        ) : (
          <ReportNoData />
        )}
      </ReportChartCard>

      <ReportChartCard
        title={AppConfig.strings.reports.activityCalendar}
        headerContent={
          <View style={styles.explanationHeader}>
            <ContextualExplanation
              title="Activity calendar"
              meaning="Each cell shows a report history bucket's net expense after refunds. Short ranges use daily buckets; longer ranges use monthly totals plotted at the bucket start date."
              interpretation="Columns run Sunday to Saturday and rows mark calendar weeks. Darker cells mean higher net expense relative to the busiest cell; shading uses a square-root scale."
              unit={targetCurrency}
              context={explanationContext}
              dataNotes={explanationDataNotes}
              testID="report-activity-calendar-explanation"
            />
          </View>
        }
      >
        {calendarHeatmap.some(point => point.value !== 0 && point.timestamp !== undefined) ? (
          <CalendarHeatmap
            data={calendarHeatmap}
            width={chartWidth}
            currency={targetCurrency}
            onCellPress={point => {
              if (point.timestamp !== undefined) {
                const periodEnd = point.periodEndTimestamp;
                const scopeLabel =
                  periodEnd !== undefined &&
                  new Date(point.timestamp).toDateString() !== new Date(periodEnd).toDateString()
                    ? `Period: ${formatDate(point.timestamp)} – ${formatDate(periodEnd)}`
                    : undefined;
                vm.onViewTransactions(point.timestamp, periodEnd, scopeLabel);
              }
            }}
          />
        ) : (
          <ReportNoData />
        )}
      </ReportChartCard>
    </>
  );
}

const styles = StyleSheet.create({
  chartSubtitle: {
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  explanationHeader: { alignItems: 'flex-end', flex: 1 },
});
