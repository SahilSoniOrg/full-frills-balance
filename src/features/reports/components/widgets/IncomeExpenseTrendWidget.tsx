import { BarChart } from '@/src/components/charts/BarChart';
import { AppConfig, REPORT_CHART_LAYOUT, Spacing } from '@/src/constants';
import { ReportChartCard } from '@/src/features/reports/components/ReportChartCard';
import { IncomeExpenseTooltipContent } from '@/src/features/reports/components/ReportTooltip';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics-service';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

const BAR_CHART_HEIGHT = REPORT_CHART_LAYOUT.barChartHeight;

export interface IncomeExpenseTrendWidgetProps {
  barChartData: {
    label: string;
    values: number[];
    colors: string[];
    startDate: number;
    endDate: number;
  }[];
  currencyCode: string;
  chartWidth: number;
  onViewSelectedTransactions: () => void;
}

export function IncomeExpenseTrendWidget({
  barChartData,
  currencyCode,
  chartWidth,
  onViewSelectedTransactions,
}: IncomeExpenseTrendWidgetProps) {
  const { theme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>();

  const onPointSelect = useCallback((index: number) => {
    setSelectedIndex(prev => (prev === index ? undefined : index));
    if (index !== undefined && index !== -1) {
      analytics.logChartInteracted('income_expense', 'point_select');
    }
  }, []);

  const renderTooltip = useCallback(
    (index: number) => {
      const data = barChartData[index];
      if (!data) return null;

      return (
        <IncomeExpenseTooltipContent
          label={data.label}
          income={data.values[0]}
          expense={data.values[1]}
          currencyCode={currencyCode}
          successColor={theme.success}
          errorColor={theme.error}
          onViewTransactions={onViewSelectedTransactions}
          incomeLabel={AppConfig.strings.reports.incomeShort}
          expenseLabel={AppConfig.strings.reports.expenseShort}
          backgroundColor={theme.surface}
        />
      );
    },
    [barChartData, theme, onViewSelectedTransactions, currencyCode],
  );

  return (
    <ReportChartCard
      title={AppConfig.strings.reports.incomeVsExpenseTrend}
      zIndex={selectedIndex !== undefined ? 100 : 40}
    >
      <View style={styles.chartContainer}>
        <BarChart
          data={barChartData}
          currencyCode={currencyCode}
          height={BAR_CHART_HEIGHT}
          width={chartWidth}
          onPress={onPointSelect}
          selectedIndex={selectedIndex}
          renderTooltipContent={renderTooltip}
        />
      </View>
    </ReportChartCard>
  );
}

const styles = StyleSheet.create({
  chartContainer: {
    marginTop: Spacing.sm,
  },
});
