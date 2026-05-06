import { BarChart } from '@/src/components/charts/BarChart';
import { LineChart } from '@/src/components/charts/LineChart';
import { SankeyChart } from '@/src/components/charts/SankeyChart';
import { AppText } from '@/src/components/core';
import {
  AppConfig,
  REPORT_CHART_LAYOUT,
  REPORT_CHART_STRINGS,
  Shape,
  Spacing,
  Theme,
} from '@/src/constants';
import { ReportChartCard } from '@/src/features/reports/components/ReportChartCard';
import {
  IncomeExpenseTooltipContent,
  NetWorthTooltipContent,
} from '@/src/features/reports/components/ReportTooltip';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

const NET_WORTH_CHART_HEIGHT = REPORT_CHART_LAYOUT.netWorthChartHeight;
const BAR_CHART_HEIGHT = REPORT_CHART_LAYOUT.barChartHeight;
const BAR_SPACER_WIDTH = Spacing.xs;
const BALANCE_BAR_HEIGHT = Spacing.sm;

interface ReportOverviewSectionProps {
  vm: ReportsViewModel;
  theme: Theme;
  chartWidth: number;
}

export function ReportOverviewSection({ vm, theme, chartWidth }: ReportOverviewSectionProps) {
  const {
    displayedNetWorthText,
    netWorthSeries,
    onNetWorthPointSelect,
    selectedNetWorthIndex,
    onViewTransactions,
    barChartData,
    onIncomeExpensePointSelect,
    selectedIncomeExpenseIndex,
    displayedIncomeText,
    displayedExpenseText,
    incomeBarFlex,
    expenseBarFlex,
    sankeyData,
  } = vm;

  const renderNetWorthTooltip = useCallback(
    (index: number) => {
      const point = netWorthSeries[index];
      if (!point) return null;
      return (
        <NetWorthTooltipContent
          date={point.date}
          netWorth={point.netWorth}
          income={point.income}
          expense={point.expense}
          currencyCode={vm.targetCurrency}
          successColor={theme.success}
          errorColor={theme.error}
          borderColor={theme.border}
          onViewTransactions={() => onViewTransactions(point.date)}
          incomeLabel={REPORT_CHART_STRINGS.incomeShort}
          expenseLabel={REPORT_CHART_STRINGS.expenseShort}
          backgroundColor={theme.surface}
        />
      );
    },
    [theme, onViewTransactions, netWorthSeries],
  );

  const renderBarTooltip = useCallback(
    (index: number) => {
      const data = barChartData[index];
      if (!data) return null;

      return (
        <IncomeExpenseTooltipContent
          label={data.label}
          income={data.values[0]}
          expense={data.values[1]}
          currencyCode={vm.targetCurrency}
          successColor={theme.success}
          errorColor={theme.error}
          onViewTransactions={vm.onViewSelectedTransactions}
          incomeLabel={REPORT_CHART_STRINGS.incomeShort}
          expenseLabel={REPORT_CHART_STRINGS.expenseShort}
          backgroundColor={theme.surface}
        />
      );
    },
    [barChartData, theme, vm.onViewSelectedTransactions],
  );

  return (
    <>
      <ReportChartCard
        zIndex={selectedNetWorthIndex !== undefined ? 100 : 50}
        headerContent={
          <View>
            <AppText variant="caption" color="secondary">
              {AppConfig.strings.reports.netWorthChange}
            </AppText>
            <AppText variant="heading">{displayedNetWorthText}</AppText>
          </View>
        }
      >
        <View style={styles.chartContainer}>
          <LineChart
            data={netWorthSeries}
            currencyCode={vm.targetCurrency}
            height={NET_WORTH_CHART_HEIGHT}
            color={theme.primary}
            width={chartWidth}
            onPress={onNetWorthPointSelect}
            selectedIndex={selectedNetWorthIndex}
            renderTooltipContent={renderNetWorthTooltip}
          />
        </View>
      </ReportChartCard>

      <ReportChartCard
        title={AppConfig.strings.reports.incomeVsExpenseTrend}
        zIndex={selectedIncomeExpenseIndex !== undefined ? 100 : 40}
      >
        <View style={styles.chartContainer}>
          <BarChart
            data={barChartData}
            currencyCode={vm.targetCurrency}
            height={BAR_CHART_HEIGHT}
            width={chartWidth}
            onPress={onIncomeExpensePointSelect}
            selectedIndex={selectedIncomeExpenseIndex}
            renderTooltipContent={renderBarTooltip}
          />
        </View>
      </ReportChartCard>

      <ReportChartCard zIndex={30}>
        <View style={styles.balanceRow}>
          <View style={styles.balanceItem}>
            <AppText variant="caption" color="secondary">
              {AppConfig.strings.reports.totalIncome}
            </AppText>
            <AppText variant="subheading" style={{ color: theme.success }}>
              {displayedIncomeText}
            </AppText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.balanceItem}>
            <AppText variant="caption" color="secondary">
              {AppConfig.strings.reports.totalExpense}
            </AppText>
            <AppText variant="subheading" style={{ color: theme.error }}>
              {displayedExpenseText}
            </AppText>
          </View>
        </View>
        <View style={styles.barContainer}>
          <View style={[styles.bar, { flex: incomeBarFlex, backgroundColor: theme.success }]} />
          <View style={{ width: BAR_SPACER_WIDTH }} />
          <View style={[styles.bar, { flex: expenseBarFlex, backgroundColor: theme.error }]} />
        </View>
      </ReportChartCard>

      <ReportChartCard title="Money Flow (Sankey)" zIndex={20}>
        <SankeyChart
          nodes={sankeyData.nodes}
          links={sankeyData.links}
          currencyCode={vm.targetCurrency}
          width={chartWidth}
        />
      </ReportChartCard>
    </>
  );
}

const styles = StyleSheet.create({
  chartContainer: {
    marginTop: Spacing.sm,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  balanceItem: {
    flex: 1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.md,
  },
  barContainer: {
    flexDirection: 'row',
    height: BALANCE_BAR_HEIGHT,
    borderRadius: Shape.radius.xs,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: Shape.radius.xs,
  },
});
