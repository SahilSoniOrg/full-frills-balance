import { AreaChart } from '@/src/components/charts/AreaChart';
import { BarChart } from '@/src/components/charts/BarChart';
import { AppText, ColoredDot } from '@/src/components/core';
import { AppConfig, REPORT_CHART_LAYOUT, Spacing } from '@/src/constants';
import { ReportChartCard } from '@/src/features/reports/components/ReportChartCard';
import { IncomeExpenseTooltipContent } from '@/src/features/reports/components/ReportTooltip';
import { ReportWealthTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

const WEALTH_CHART_HEIGHT = REPORT_CHART_LAYOUT.netWorthChartHeight;

interface ReportWealthSectionProps {
  vm: ReportWealthTabVm;
  chartWidth: number;
}

export function ReportWealthSection({ vm, chartWidth }: ReportWealthSectionProps) {
  const { theme } = useTheme();
  const { wealthAreaSeries, barChartData, dailyData, targetCurrency, onViewTransactions } = vm;

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
          incomeLabel={AppConfig.strings.reports.assets}
          expenseLabel={AppConfig.strings.reports.liabilitiesShort}
          backgroundColor={theme.surface}
        />
      );
    },
    [dailyData, theme, targetCurrency, onViewTransactions],
  );

  return (
    <>
      <ReportChartCard
        title={AppConfig.strings.reports.netWorthHistory}
        zIndex={selectedAreaIndex !== undefined ? 100 : 50}
      >
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

      <ReportChartCard title={AppConfig.strings.reports.dailyMomentum}>
        <View style={styles.chartContainer}>
          <BarChart
            data={barChartData}
            currencyCode={targetCurrency}
            height={WEALTH_CHART_HEIGHT}
            width={chartWidth}
            onPress={setSelectedBarIndex}
            selectedIndex={selectedBarIndex}
            renderTooltipContent={renderAreaTooltip}
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
  placeholderText: {
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
});
