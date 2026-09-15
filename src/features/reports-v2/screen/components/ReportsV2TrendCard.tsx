import { AppText } from '@/src/components/core';
import { BarChart, type BarChartDataPoint } from '@/src/components/charts/BarChart';
import { LineChart, type DataPoint } from '@/src/components/charts/LineChart';
import { ReportChartCard } from '@/src/components/charts/ReportChartCard';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useTheme } from '@/src/hooks/use-theme';
import type { ReportVisualization } from '@/src/services/reports-v2/types/result';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

function chartLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ReportsV2TrendCard({ visualization }: { visualization: ReportVisualization }) {
  const privateMode = useEffectivePrivacyMode();
  const { theme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>();
  const waterfall = visualization.kind === 'WATERFALL' ? visualization : null;
  const reportSeries = visualization.kind === 'WATERFALL' ? null : visualization.series;
  const series = useMemo(() => reportSeries ?? [], [reportSeries]);
  const chartSeries = useMemo(
    () =>
      waterfall
        ? [
            { id: 'opening', label: 'Opening', value: waterfall.opening },
            ...waterfall.changes.flatMap(change =>
              change.value.kind === 'MONEY'
                ? [{ id: change.id, label: change.label, value: change.value }]
                : [],
            ),
            { id: 'closing', label: 'Closing', value: waterfall.closing },
          ]
        : null,
    [waterfall],
  );
  const barData = useMemo<BarChartDataPoint[]>(() => {
    if (chartSeries) {
      return chartSeries.map(item => ({
        label: item.label,
        values: [item.value.amount],
        colors: [item.value.amount < 0 ? theme.error : theme.primary],
      }));
    }
    const points = series[0]?.points ?? [];
    return points.map((point, index) => ({
      label: chartLabel(point.date),
      values: series.map(item => item.points[index]?.value.amount ?? 0),
      colors: series.map(item =>
        item.points[index]?.value.amount < 0 ? theme.error : theme.primary,
      ),
    }));
  }, [chartSeries, series, theme.error, theme.primary]);
  const lineData = useMemo<DataPoint[]>(
    () => (series[0]?.points ?? []).map(point => ({ x: point.date, y: point.value.amount })),
    [series],
  );
  const secondaryLineData = useMemo<DataPoint[]>(
    () => (series[1]?.points ?? []).map(point => ({ x: point.date, y: point.value.amount })),
    [series],
  );
  const tooltip = useCallback(
    (index: number) => {
      if (chartSeries) {
        const item = chartSeries[index];
        return item ? (
          <MoneyText amount={item.value.amount} currencyCode={item.value.currencyCode} />
        ) : null;
      }
      return series.map(item => {
        const point = item.points[index];
        return point ? (
          <AppText key={item.id} variant="caption">
            {item.label}:{' '}
            <MoneyText amount={point.value.amount} currencyCode={point.value.currencyCode} />
          </AppText>
        ) : null;
      });
    },
    [chartSeries, series],
  );
  const chart = chartSeries ? (
    <BarChart
      data={barData}
      currencyCode={waterfall!.closing.currencyCode}
      selectedIndex={selectedIndex}
      onPress={index => setSelectedIndex(index < 0 ? undefined : index)}
      renderTooltipContent={tooltip}
    />
  ) : visualization.kind === 'LINE' ? (
    <LineChart
      data={lineData}
      secondaryData={secondaryLineData.length > 0 ? secondaryLineData : undefined}
      currencyCode={series[0]?.points[0]?.value.currencyCode ?? ''}
      selectedIndex={selectedIndex}
      onPress={index => setSelectedIndex(index < 0 ? undefined : index)}
      renderTooltipContent={tooltip}
    />
  ) : (
    <BarChart
      data={barData}
      currencyCode={series[0]?.points[0]?.value.currencyCode ?? ''}
      stacked={visualization.kind === 'STACKED_BAR'}
      selectedIndex={selectedIndex}
      onPress={index => setSelectedIndex(index < 0 ? undefined : index)}
      renderTooltipContent={tooltip}
    />
  );

  return (
    <ReportChartCard
      title="Trend"
      headerContent={
        <View style={styles.chartLegend} accessibilityLabel="Trend series">
          {(chartSeries ?? series).map(item => (
            <AppText key={item.id} variant="caption" color="secondary">
              ● {item.label}
            </AppText>
          ))}
        </View>
      }
      testID="reports-v2-trend"
    >
      <View accessibilityRole="image" accessibilityLabel="Report trend chart">
        {chart}
      </View>
      <AppText variant="caption" color="secondary">
        {privateMode ? 'Values hidden' : 'Tap the chart to inspect a point'}
      </AppText>
    </ReportChartCard>
  );
}

const styles = StyleSheet.create({
  chartLegend: {
    flexDirection: 'row',
    gap: Spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flex: 1,
    marginLeft: Spacing.md,
  },
});
