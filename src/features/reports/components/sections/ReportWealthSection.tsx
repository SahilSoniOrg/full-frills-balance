import { AreaChart } from '@/src/components/charts/AreaChart';
import { BarChart } from '@/src/components/charts/BarChart';
import { AppText, ColoredDot } from '@/src/components/core';
import { ContextualExplanation } from '@/src/components/shared/ContextualExplanation';
import { AppConfig, REPORT_CHART_LAYOUT, Spacing } from '@/src/constants';
import { ReportChartCard } from '@/src/components/charts/ReportChartCard';
import { IncomeExpenseTooltipContent } from '@/src/features/reports/components/ReportTooltip';
import { ReportNoData } from '@/src/features/reports/components/ReportNoData';
import { ReportWealthTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

const WEALTH_CHART_HEIGHT = REPORT_CHART_LAYOUT.netWorthChartHeight;

interface ReportWealthSectionProps {
  vm: ReportWealthTabVm;
  chartWidth: number;
  explanationScope: {
    periodLabel: string;
    accountScopeLabel: string;
  };
}

export function ReportWealthSection({
  vm,
  chartWidth,
  explanationScope,
}: ReportWealthSectionProps) {
  const { theme } = useTheme();
  const { wealthAreaSeries, barChartData, dailyData, targetCurrency, onViewTransactions } = vm;
  const explanationContext = [
    { label: 'Period', value: explanationScope.periodLabel },
    { label: 'Accounts', value: explanationScope.accountScopeLabel },
  ];
  const explanationDataNotes = [
    'Amounts use the report currency; historical exchange rates are used when needed.',
    'Chart selection shows period totals for drill-down; open Help for metric meaning.',
  ];

  const [selectedAreaIndex, setSelectedAreaIndex] = useState<number | undefined>(undefined);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | undefined>(undefined);

  const renderAreaTooltip = useCallback(
    (index: number) => {
      const data = dailyData[index];
      if (!data) return null;

      return (
        <IncomeExpenseTooltipContent
          label={new Date(data.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
          income={data.assets}
          expense={data.liabilities}
          currencyCode={targetCurrency}
          successColor={theme.success}
          errorColor={theme.error}
          onViewTransactions={() => onViewTransactions(data.date)}
          incomeLabel={AppConfig.strings.reports.totalIncome}
          expenseLabel={AppConfig.strings.reports.totalExpense}
          backgroundColor={theme.surface}
        />
      );
    },
    [dailyData, theme, targetCurrency, onViewTransactions],
  );

  const renderBarTooltip = useCallback(
    (index: number) => {
      const data = barChartData[index];
      if (!data) return null;

      return (
        <IncomeExpenseTooltipContent
          label={data.label}
          income={data.values[0] ?? 0}
          expense={data.values[1] ?? 0}
          currencyCode={targetCurrency}
          successColor={theme.success}
          errorColor={theme.error}
          onViewTransactions={() =>
            onViewTransactions(data.startDate, data.endDate, `Period: ${data.label}`)
          }
          incomeLabel={AppConfig.strings.reports.assets}
          expenseLabel={AppConfig.strings.reports.liabilitiesShort}
          backgroundColor={theme.surface}
        />
      );
    },
    [barChartData, theme, targetCurrency, onViewTransactions],
  );

  return (
    <>
      <ReportChartCard
        title={AppConfig.strings.reports.netWorthHistory}
        zIndex={selectedAreaIndex !== undefined ? 100 : 50}
        headerContent={
          <View style={styles.explanationHeader}>
            <ContextualExplanation
              title="Net worth history"
              meaning="Each point reconstructs available assets and liabilities through the selected period using opening balances and dated account changes."
              interpretation="The area is a reconstructed history, not a separate end-of-day snapshot for every date. Missing balances or exchange rates can make the curve approximate."
              unit={targetCurrency}
              context={explanationContext}
              dataNotes={explanationDataNotes}
              testID="report-net-worth-history-explanation"
            />
          </View>
        }
      >
        {wealthAreaSeries.some(series => series.length > 0) ? (
          <View style={styles.chartContainer}>
            <AreaChart
              series={wealthAreaSeries}
              height={WEALTH_CHART_HEIGHT}
              colors={[theme.success, theme.error]}
              width={chartWidth}
              onPress={setSelectedAreaIndex}
              selectedIndex={selectedAreaIndex}
              renderTooltipContent={renderAreaTooltip}
            />
          </View>
        ) : (
          <ReportNoData />
        )}
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <ColoredDot color={theme.success} />
            <AppText variant="caption" color="secondary">
              {AppConfig.strings.reports.assets}
            </AppText>
          </View>
          <View style={styles.legendItem}>
            <ColoredDot color={theme.error} />
            <AppText variant="caption" color="secondary">
              {AppConfig.strings.reports.liabilities}
            </AppText>
          </View>
        </View>
      </ReportChartCard>

      <ReportChartCard
        title={AppConfig.strings.reports.dailyMomentum}
        headerContent={
          <View style={styles.explanationHeader}>
            <ContextualExplanation
              title="Daily momentum"
              meaning="Each bar compares assets and liabilities for one report period bucket inside the selected range."
              interpretation="Taller asset bars relative to liability bars mean higher net worth contribution in that bucket. Use the selection tooltip to open matching transactions."
              unit={targetCurrency}
              context={explanationContext}
              dataNotes={explanationDataNotes}
              testID="report-daily-momentum-explanation"
            />
          </View>
        }
      >
        <View style={styles.chartContainer}>
          <BarChart
            data={barChartData}
            currencyCode={targetCurrency}
            height={WEALTH_CHART_HEIGHT}
            width={chartWidth}
            onPress={setSelectedBarIndex}
            selectedIndex={selectedBarIndex}
            renderTooltipContent={renderBarTooltip}
          />
        </View>
      </ReportChartCard>
    </>
  );
}

const styles = StyleSheet.create({
  chartContainer: {
    marginTop: Spacing.sm,
  },
  explanationHeader: {
    marginLeft: Spacing.xs,
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    marginTop: Spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
