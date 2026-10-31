import { CalendarHeatmap } from '@/src/components/charts/CalendarHeatmap';
import { HeatmapChart } from '@/src/components/charts/HeatmapChart';
import { ReportChartCard } from '@/src/components/charts/ReportChartCard';
import { AppText } from '@/src/components/core';
import { ContextualExplanation } from '@/src/components/shared/ContextualExplanation';
import { MoneyFlowWidget } from '@/src/components/reports/MoneyFlowWidget';
import { AppConfig } from '@/src/constants';
import { Spacing } from '@/src/constants/design-tokens';
import type {
  ReportTrendVisualization,
  ReportVisualization,
} from '@/src/services/reports-v2/types/result';
import { useWindowDimensions } from 'react-native';
import { ReportsV2TrendCard } from './ReportsV2TrendCard';
import { explanationContextItems, type ReportsV2ExplanationContext } from './reportExplanations';

function isTrendVisualization(
  visualization: ReportVisualization,
): visualization is ReportTrendVisualization {
  return (
    visualization.kind === 'LINE' ||
    visualization.kind === 'BAR' ||
    visualization.kind === 'STACKED_BAR' ||
    visualization.kind === 'WATERFALL'
  );
}

export function ReportsV2VisualizationCard({
  sectionId,
  visualization,
  context,
  dataNotes,
  onDrilldown,
  interactive,
}: {
  sectionId: string;
  visualization: ReportVisualization;
  context: ReportsV2ExplanationContext;
  dataNotes: readonly string[];
  onDrilldown: (input: {
    label: string;
    accountIds?: readonly string[];
    journalIds?: readonly string[];
    flowClassifications?: readonly ('EXPENSE' | 'REFUND')[];
    startDate?: number;
    endDate?: number;
  }) => void;
  interactive: boolean;
}) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(0, width - (Spacing.md * 2 + Spacing.lg * 2));

  if (visualization.kind === 'SANKEY') {
    return (
      <MoneyFlowWidget
        sankeyData={visualization.data}
        currencyCode={context.currencyCode}
        chartWidth={chartWidth}
      />
    );
  }

  if (visualization.kind === 'HEATMAP' || visualization.kind === 'CALENDAR_HEATMAP') {
    const isCalendar = visualization.kind === 'CALENDAR_HEATMAP';
    const title = isCalendar ? 'Activity calendar' : 'Spending heatmap';
    const hasData = isCalendar
      ? visualization.points.some(point => point.value !== 0 && point.timestamp !== undefined)
      : visualization.points.some(point => point.value > 0);
    const explanation = isCalendar
      ? {
          meaning:
            "Each cell shows a report history bucket's net expense after refunds. Short ranges use daily buckets; longer ranges use monthly totals plotted at the bucket start date.",
          interpretation:
            'Columns run Sunday to Saturday and rows mark calendar weeks. Darker cells mean higher net expense relative to the busiest cell; shading uses a square-root scale.',
        }
      : {
          meaning:
            'Each cell sums debit transaction amounts from selected income and expense accounts for one weekday and local hour. Weekdays run Monday to Sunday.',
          interpretation:
            'A darker cell means a larger total than lighter cells, scaled against the busiest cell. Color intensity is not linear and does not represent a transaction count.',
        };

    return (
      <ReportChartCard
        title={title}
        headerContent={
          <ContextualExplanation
            title={title}
            meaning={explanation.meaning}
            interpretation={explanation.interpretation}
            unit={context.currencyCode}
            context={explanationContextItems(context)}
            dataNotes={dataNotes}
            testID={`reports-v2-explain-${isCalendar ? 'calendar-heatmap' : 'spending-heatmap'}`}
          />
        }
      >
        {hasData ? (
          isCalendar ? (
            <CalendarHeatmap
              data={visualization.points}
              width={chartWidth}
              currency={visualization.currencyCode}
              onCellPress={
                interactive
                  ? point => {
                      if (point.timestamp === undefined) return;
                      const periodEnd = point.periodEndTimestamp ?? point.timestamp;
                      onDrilldown({
                        label: title,
                        startDate: point.timestamp,
                        endDate: periodEnd,
                        flowClassifications: ['EXPENSE', 'REFUND'],
                      });
                    }
                  : undefined
              }
            />
          ) : (
            <HeatmapChart
              data={visualization.points}
              width={chartWidth}
              currency={visualization.currencyCode}
              onCellPress={
                interactive
                  ? point =>
                      onDrilldown({
                        label: title,
                        journalIds: point.journalIds,
                      })
                  : undefined
              }
            />
          )
        ) : (
          <AppText variant="caption" color="secondary">
            {AppConfig.strings.reports.chartNoData}
          </AppText>
        )}
        {!isCalendar && hasData ? (
          <AppText variant="caption" color="secondary">
            {AppConfig.strings.reports.heatmapSubtitle}
          </AppText>
        ) : null}
        {isCalendar && hasData ? (
          <AppText variant="caption" color="secondary">
            Tap a nonzero cell to inspect transactions in that period.
          </AppText>
        ) : null}
      </ReportChartCard>
    );
  }

  if (!isTrendVisualization(visualization)) return null;
  return (
    <ReportsV2TrendCard
      sectionId={sectionId}
      visualization={visualization}
      context={context}
      dataNotes={dataNotes}
    />
  );
}
