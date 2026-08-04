import { LineChart } from '@/src/components/charts/LineChart';
import { AppText } from '@/src/components/core';
import { AppConfig, REPORT_CHART_LAYOUT, Spacing } from '@/src/constants';
import { ReportChartCard } from '@/src/features/reports/components/ReportChartCard';
import { NetWorthTooltipContent } from '@/src/features/reports/components/ReportTooltip';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics-service';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

const NET_WORTH_CHART_HEIGHT = REPORT_CHART_LAYOUT.netWorthChartHeight;

export interface NetWorthTrendWidgetProps {
  series: {
    x: number;
    y: number;
    date: number;
    netWorth: number;
    income: number;
    expense: number;
    assets: number;
    liabilities: number;
  }[];
  displayedNetWorthText: string;
  currencyCode: string;
  chartWidth: number;
  isPrivacyMode: boolean;
  onViewTransactions: (date: number) => void;
}

export function NetWorthTrendWidget({
  series,
  displayedNetWorthText,
  currencyCode,
  chartWidth,
  isPrivacyMode,
  onViewTransactions,
}: NetWorthTrendWidgetProps) {
  const { theme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>();

  const onPointSelect = useCallback(
    (index: number) => {
      setSelectedIndex(prev => (prev === index ? undefined : index));
      if (index !== undefined && index !== -1) {
        const point = series[index];
        if (point) analytics.logChartInteracted('net_worth', 'point_select');
      }
    },
    [series],
  );

  const renderTooltip = useCallback(
    (index: number) => {
      const point = series[index];
      if (!point) return null;
      return (
        <NetWorthTooltipContent
          date={point.date}
          netWorth={point.netWorth}
          income={point.income}
          expense={point.expense}
          currencyCode={currencyCode}
          successColor={theme.success}
          errorColor={theme.error}
          borderColor={theme.border}
          onViewTransactions={() => onViewTransactions(point.date)}
          incomeLabel={AppConfig.strings.reports.incomeShort}
          expenseLabel={AppConfig.strings.reports.expenseShort}
          backgroundColor={theme.surface}
          isPrivacyMode={isPrivacyMode}
        />
      );
    },
    [theme, onViewTransactions, series, currencyCode, isPrivacyMode],
  );

  return (
    <ReportChartCard
      zIndex={selectedIndex !== undefined ? 100 : 50}
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
          data={series}
          currencyCode={currencyCode}
          height={NET_WORTH_CHART_HEIGHT}
          color={theme.primary}
          width={chartWidth}
          onPress={onPointSelect}
          selectedIndex={selectedIndex}
          renderTooltipContent={renderTooltip}
          hideLabels={isPrivacyMode}
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
