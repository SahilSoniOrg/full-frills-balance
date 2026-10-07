import { AppCard, AppText, ErrorStateView } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppConfig, Shape, Spacing } from '@/src/constants';
import type { BudgetPeriodPresentation } from '../helpers/budgetDetailPresentation';
import { resolveBudgetStatus } from '../helpers/budgetCardPresentation';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { buildBudgetSpendingChartGeometry } from './budgetSpendingChartGeometry';
import type { BudgetCumulativeChart } from '@/src/services/budget/budgetCumulativeChartService';
import type { BudgetUsage } from '@/src/services/budget/types';
import { useTheme } from '@/src/hooks/use-theme';
import { resolveThemeColor } from '@/src/design-system/utils';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

interface Props {
  chartData: BudgetCumulativeChart | null;
  previousChartData: BudgetCumulativeChart | null;
  usage: BudgetUsage;
  currencyCode: string;
  periodRange: { startDate: number; endDate: number };
  period: BudgetPeriodPresentation;
  now: number;
  previousPeriodRange?: { startDate: number; endDate: number };
  isCurrentPeriod: boolean;
  isLoading: boolean;
  error?: string;
  onRetry: () => void;
}

const CHART_HEIGHT = 156;
const CHART_TOP = 12;
const CHART_BOTTOM = 10;
const CHART_SIDE = 2;

export function BudgetSpendingChart({
  chartData,
  previousChartData,
  usage,
  currencyCode,
  periodRange,
  period,
  now,
  previousPeriodRange,
  isCurrentPeriod,
  isLoading,
  error,
  onRetry,
}: Props) {
  const { theme } = useTheme();
  const isPrivate = useEffectivePrivacyMode();
  const formatMoney = useMoneyFormat();
  const [width, setWidth] = React.useState(0);
  const strings = AppConfig.strings.budgetDetailRedesign;
  const periodDays = period.periodDays;
  const geometry = chartData
    ? buildBudgetSpendingChartGeometry({
        chartData,
        previousChartData,
        currentPeriod: periodRange,
        previousPeriod: previousPeriodRange,
        periodDays,
        elapsedShare: period.elapsedShare,
        isCurrentPeriod,
        now,
      })
    : null;
  const evenPaceToday = usage.budgetAmount * period.elapsedShare;
  const hasNothingSpent = usage.spent === 0 && !usage.hasUnvaluedEntries;
  const incomplete = usage.hasUnvaluedEntries || chartData?.hasUnvaluedEntries;
  const canShowPace = !!geometry && !isLoading && !error && !incomplete && !hasNothingSpent;
  const paceDifference = Math.abs((geometry?.todaySpent ?? usage.spent) - evenPaceToday);
  const isOverPace = (geometry?.todaySpent ?? usage.spent) > evenPaceToday;
  const chartAccessibilityLabel = strings.chartAccessibilityLabel(
    hasNothingSpent
      ? strings.nothingSpent
      : incomplete
        ? strings.status.incomplete
        : strings.status[resolveBudgetStatus(usage.usagePercent, period.elapsedShare).status],
    strings.spentPercent(isPrivate ? AppConfig.privacyMask : Math.round(usage.usagePercent * 100)),
    Math.round(period.elapsedShare * 100),
  );

  const paths = React.useMemo(() => {
    if (!width || !geometry) return null;
    const plotWidth = Math.max(1, width - CHART_SIDE * 2);
    const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
    const maxY = Math.max(
      usage.budgetAmount,
      1,
      ...geometry.currentPoints.map(point => point.y),
      ...geometry.previousPoints.map(point => point.y),
    );
    const minY = Math.min(
      0,
      ...geometry.currentPoints.map(point => point.y),
      ...geometry.previousPoints.map(point => point.y),
    );
    const xFromOffset = (offset: number) =>
      CHART_SIDE + (Math.min(periodDays, Math.max(0, offset)) / periodDays) * plotWidth;
    const yFromValue = (value: number) =>
      CHART_TOP + plotHeight - ((value - minY) / (maxY - minY)) * plotHeight;
    const pointsToString = (points: { x: number; y: number }[]) =>
      points.map(point => `${xFromOffset(point.x)},${yFromValue(point.y)}`).join(' ');
    const endpoint = geometry.currentPoints.at(-1) ?? { x: geometry.todayOffset, y: 0 };

    return {
      current: pointsToString(geometry.currentPoints),
      previous: pointsToString(geometry.previousPoints),
      todayX: xFromOffset(geometry.todayOffset),
      todayY: yFromValue(endpoint.y),
      paceLine: {
        x1: xFromOffset(0),
        y1: yFromValue(0),
        x2: xFromOffset(periodDays),
        y2: yFromValue(usage.budgetAmount),
      },
      todayLine: { y1: CHART_TOP, y2: CHART_HEIGHT - CHART_BOTTOM },
      baseline: { x1: CHART_SIDE, x2: width - CHART_SIDE, y: yFromValue(0) },
    };
  }, [geometry, periodDays, usage.budgetAmount, width]);

  const startDate = dayjs(periodRange.startDate).format('MMM D');
  const endDate = dayjs(periodRange.endDate).format('MMM D');
  const limit = formatMoney(usage.budgetAmount, currencyCode);

  return (
    <AppCard elevation="sm" style={styles.card}>
      <View style={styles.heading}>
        <AppText variant="body" weight="semibold" style={styles.headingTitle}>
          {strings.spendingSoFar}
        </AppText>
        {canShowPace ? (
          <View style={styles.paceValue}>
            <MoneyText
              amount={paceDifference}
              currencyCode={currencyCode}
              variant="caption"
              weight="semibold"
            />
            <AppText variant="caption" color="secondary">
              {` ${isOverPace ? strings.overPace : strings.underPace}`}
            </AppText>
          </View>
        ) : null}
      </View>

      <View
        testID="budget-spending-chart-layout"
        onLayout={event => setWidth(event.nativeEvent.layout.width)}
        style={styles.chartWrap}
      >
        {isLoading ? (
          <AppText variant="caption" color="secondary">
            {AppConfig.strings.common.loading}
          </AppText>
        ) : error ? (
          <ErrorStateView
            variant="inline"
            message={error}
            retryLabel={AppConfig.strings.budgetDetailRedesign.retryBreakdown}
            onRetry={onRetry}
          />
        ) : chartData && paths ? (
          <View accessibilityRole="image" accessibilityLabel={chartAccessibilityLabel}>
            <Svg width={width} height={CHART_HEIGHT}>
              <Line
                testID="budget-chart-zero-baseline"
                x1={paths.baseline.x1}
                x2={paths.baseline.x2}
                y1={paths.baseline.y}
                y2={paths.baseline.y}
                stroke={theme.border}
                strokeWidth={1}
              />
              <Line
                {...paths.paceLine}
                stroke={resolveThemeColor(theme, 'textSecondary') ?? theme.textSecondary}
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              {paths.previous ? (
                <Polyline
                  points={paths.previous}
                  fill="none"
                  stroke={theme.textTertiary}
                  strokeOpacity={0.55}
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              <Polyline
                points={paths.current}
                fill="none"
                stroke={resolveThemeColor(theme, 'primary')}
                strokeWidth={2.6}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {isCurrentPeriod ? (
                <>
                  <Line
                    x1={paths.todayX}
                    x2={paths.todayX}
                    y1={paths.todayLine.y1}
                    y2={paths.todayLine.y2}
                    stroke={theme.text}
                    strokeOpacity={0.25}
                    strokeWidth={1}
                  />
                  <Circle
                    testID="budget-chart-today-dot"
                    cx={paths.todayX}
                    cy={paths.todayY}
                    r={4}
                    fill={resolveThemeColor(theme, 'primary')}
                  />
                </>
              ) : null}
            </Svg>
            <View style={styles.axisLabels}>
              <AppText variant="caption" color="secondary">
                {strings.chartStartDate(startDate)}
              </AppText>
              {isCurrentPeriod ? (
                <AppText variant="caption" color="secondary">
                  {strings.today}
                </AppText>
              ) : null}
              <AppText variant="caption" color="secondary" style={styles.axisEnd}>
                {strings.chartEndDate(limit, endDate)}
              </AppText>
            </View>
            <View style={styles.legend}>
              <Legend
                color={resolveThemeColor(theme, 'primary') ?? theme.primary}
                label={strings.spendingSoFar}
              />
              <Legend
                color={resolveThemeColor(theme, 'textSecondary') ?? theme.textSecondary}
                dashed
                label={strings.evenPace}
              />
              {previousChartData ? (
                <Legend
                  color={resolveThemeColor(theme, 'textTertiary') ?? theme.textTertiary}
                  label={strings.previousPeriod}
                />
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </AppCard>
  );
}

function Legend({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendLine, { borderColor: color }, dashed && styles.dashedLegend]} />
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.lg, borderRadius: Shape.radius.xl },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  headingTitle: { flexShrink: 1 },
  paceValue: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 1 },
  chartWrap: { marginTop: Spacing.sm, width: '100%', minHeight: CHART_HEIGHT },
  axisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  axisEnd: { textAlign: 'right', flexShrink: 1 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minHeight: 24 },
  legendLine: { width: 16, borderTopWidth: 2 },
  dashedLegend: { borderStyle: 'dashed' },
});
