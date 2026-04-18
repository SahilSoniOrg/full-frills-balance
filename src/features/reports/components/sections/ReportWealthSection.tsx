import { AreaChart } from '@/src/components/charts/AreaChart';
import { BarChart } from '@/src/components/charts/BarChart';
import { AppText } from '@/src/components/core';
import { REPORT_CHART_LAYOUT, Spacing, Theme } from '@/src/constants';
import { ReportChartCard } from '@/src/features/reports/components/ReportChartCard';
import { IncomeExpenseTooltipContent } from '@/src/features/reports/components/ReportTooltip';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

const WEALTH_CHART_HEIGHT = REPORT_CHART_LAYOUT.netWorthChartHeight;

interface ReportWealthSectionProps {
  vm: ReportsViewModel;
  theme: Theme;
  chartWidth: number;
}

export function ReportWealthSection({ vm, theme, chartWidth }: ReportWealthSectionProps) {
  const { wealthAreaSeries, barChartData, dailyData } = vm;

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
          successColor={theme.success}
          errorColor={theme.error}
          onViewTransactions={() => vm.onViewTransactions(data.date)}
          incomeLabel="Assets"
          expenseLabel="Liabil."
          backgroundColor={theme.surface}
        />
      );
    },
    [dailyData, theme, vm],
  );

  return (
    <>
      <ReportChartCard
        title="Net Worth History"
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
            <View style={[styles.legendDot, { backgroundColor: theme.success }]} />
            <AppText variant="caption" color="secondary">
              Assets
            </AppText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.error }]} />
            <AppText variant="caption" color="secondary">
              Liabilities
            </AppText>
          </View>
        </View>
      </ReportChartCard>

      <ReportChartCard title="Daily Momentum">
        <View style={styles.chartContainer}>
          <BarChart
            data={barChartData}
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
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  placeholderText: {
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
});
