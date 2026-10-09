import { MoneyText } from '@/src/components/shared/MoneyText';
import { BudgetProgressBar } from '@/src/components/budget/BudgetProgressBar';
import { ChartLegendItem } from '@/src/components/charts/ChartLegendItem';
import { LineChart } from '@/src/components/charts/LineChart';
import { PeriodStepper } from '@/src/components/shared/PeriodStepper';
import { ScreenSectionHeader } from '@/src/components/shared/ScreenSectionHeader';
import { AppIcon, AppText, Badge, Icon } from '@/src/components/core';
import { Opacity, Size, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { accountDetailsCopy } from '@/src/features/accounts/helpers/accountFlowLabels';
import {
  presentAccountPeriod,
  presentAccountPeriodRange,
} from '@/src/features/accounts/helpers/accountPeriodPresentation';
import type { AccountActivitySectionModel } from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useTheme } from '@/src/hooks/use-theme';
import { useCalendarDay } from '@/src/hooks/useCalendarDay';
import { isCategoryAccountType, resolveAccountAppearance } from '@/src/utils/accountCategory';
import { getReadableColor } from '@/src/utils/color-math';
import { AccountType } from '@/src/types/enums';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

export type AccountActivitySectionProps = AccountActivitySectionModel & {
  accountType: AccountType;
  currencyCode: string;
  accountColor?: string;
  initialChartExpanded?: boolean;
};

function Stat({
  label,
  children,
  comparison = false,
}: {
  label: string;
  children: React.ReactNode;
  comparison?: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  return (
    <View
      style={[
        styles.stat,
        comparison && styles.comparisonStat,
        width / fontScale < 320 && styles.stackedStat,
      ]}
    >
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
      {children}
    </View>
  );
}

export function AccountActivitySection({
  accountType,
  dateRange,
  onShowDatePicker,
  onPreviousPeriod,
  onNextPeriod,
  chartData,
  rollingAverageData,
  xTicks,
  periodMetrics,
  previousPeriod,
  currencyCode,
  accountColor,
  initialChartExpanded = false,
}: AccountActivitySectionProps) {
  const { theme } = useTheme();
  const isPrivate = useEffectivePrivacyMode();
  const [chartWidth, setChartWidth] = useState(0);
  const [chartExpanded, setChartExpanded] = useState(initialChartExpanded);
  const now = useCalendarDay();
  const range = presentAccountPeriodRange(dateRange, now);
  const period = presentAccountPeriod({
    accountType,
    metrics: periodMetrics,
    isPrivate,
    previous: previousPeriod,
  });
  const loading = periodMetrics.isLoading;
  const isCategory = isCategoryAccountType(accountType);
  const { accentColor } = resolveAccountAppearance({ accountType, color: accountColor }, theme);
  const chartColor = getReadableColor(accentColor, theme.surface);
  const { chartTitle, chartLine } = accountDetailsCopy(accountType);
  const showStats =
    !(period.isEmpty && !loading) && (period.stats.length > 0 || !!period.comparison);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.periodRegion,
          { borderTopColor: theme.divider, borderBottomColor: theme.divider },
        ]}
        testID="account-period-card"
      >
        <PeriodStepper
          label={range.label}
          period={range.period}
          onPrevious={dateRange ? onPreviousPeriod : undefined}
          onNext={dateRange ? onNextPeriod : undefined}
          onPressLabel={onShowDatePicker}
          labelAccessibilityHint="Choose a different period"
          testID="account-period-stepper"
        />

        <View style={[styles.periodAmount, isCategory && styles.categoryPeriodAmount]}>
          <View style={styles.heroHeading}>
            <AppText variant="caption" color="secondary" weight="medium">
              {period.heroLabel}
            </AppText>
            {period.badge && !loading ? (
              <Badge variant={period.badge.variant} size="sm">
                {period.badge.label}
              </Badge>
            ) : null}
          </View>

          <View style={styles.periodValue}>
            <MoneyText
              amount={period.heroAmount}
              currencyCode={currencyCode}
              prefix={period.heroSign}
              variant={isCategory ? 'title' : 'xl'}
              weight="semibold"
              loading={loading}
              testID="account-period-amount"
            />
          </View>
        </View>

        {period.isEmpty && !loading ? (
          <AppText variant="caption" color="secondary">
            No entries in this period
          </AppText>
        ) : null}

        {showStats ? (
          <View style={styles.stats}>
            {period.stats.map(stat => (
              <Stat key={stat.label} label={stat.label}>
                <MoneyText
                  amount={stat.amount}
                  currencyCode={currencyCode}
                  prefix={stat.sign}
                  variant="bodySmall"
                  weight="semibold"
                  color={stat.tone}
                  loading={loading}
                />
              </Stat>
            ))}
            {period.comparison ? (
              <Stat label={period.comparison.label} comparison>
                <MoneyText
                  amount={period.comparison.amount}
                  currencyCode={currencyCode}
                  prefix={period.comparison.sign}
                  variant="bodySmall"
                  weight="semibold"
                  color="text"
                  loading={loading}
                />
              </Stat>
            ) : null}
          </View>
        ) : null}

        {period.bar && !loading ? (
          <View style={styles.barContainer} testID="account-period-bar">
            <BudgetProgressBar
              progress={period.bar.progress}
              statusColor={period.bar.color}
              accessibilityLabel={period.bar.caption}
            />
            <AppText variant="caption" color="secondary">
              {period.bar.caption}
            </AppText>
          </View>
        ) : null}

        {chartData.length > 0 ? (
          <View>
            <Pressable
              onPress={() => setChartExpanded(expanded => !expanded)}
              accessibilityRole="button"
              accessibilityLabel={`${chartExpanded ? 'Hide' : 'Show'} ${chartTitle.toLowerCase()} chart`}
              accessibilityState={{ expanded: chartExpanded }}
              testID="account-trend-toggle"
              style={({ pressed }) => [styles.chartToggle, pressed && { opacity: Opacity.medium }]}
            >
              <AppText variant="bodySmall" weight="medium" style={styles.trendTitle}>
                {chartTitle}
              </AppText>
              <AppText variant="caption" color="secondary">
                {chartExpanded ? 'Hide chart' : 'Show chart'}
              </AppText>
              <AppIcon
                name={chartExpanded ? Icon.ChevronUp : Icon.ChevronDown}
                size={Size.iconXs}
                color={theme.textSecondary}
              />
            </Pressable>
            {chartExpanded ? (
              <View testID="account-trend-chart">
                {rollingAverageData.length > 0 ? (
                  <ChartLegendItem color={theme.warning} label="7-day average" />
                ) : null}
                <View
                  style={styles.chartWrap}
                  onLayout={event => setChartWidth(event.nativeEvent.layout.width)}
                >
                  {chartWidth > 0 ? (
                    <LineChart
                      data={chartData}
                      width={chartWidth}
                      height={160}
                      tooltipWidth={210}
                      color={chartColor}
                      showGradient={false}
                      domainX={dateRange ? [dateRange.startDate, dateRange.endDate] : undefined}
                      todayX={range.isCurrent ? now : undefined}
                      currencyCode={currencyCode}
                      secondaryData={rollingAverageData}
                      secondaryColor={theme.warning}
                      xTicks={xTicks}
                      formatXTick={x => dayjs(x).format('D MMM')}
                      avoidPointVertical={true}
                      renderTooltipContent={index => {
                        const point = chartData[index];
                        const rollingPoint = rollingAverageData[index];
                        const startPoint = chartData[0];

                        if (!point || !startPoint) return null;

                        // A category period is already relative to its opening balance.
                        const changeFromStart =
                          point.y - (isCategory && dateRange ? 0 : startPoint.y);
                        const isPositive = changeFromStart >= 0;

                        return (
                          <View style={{ width: '100%' }}>
                            <AppText
                              variant="caption"
                              color="secondary"
                              style={{ marginBottom: REPORT_CHART_LAYOUT.tooltipDateMarginBottom }}
                            >
                              {dayjs(point.x).format('MMM D, YYYY')}
                            </AppText>
                            <View style={styles.tooltipRow}>
                              <AppText variant="caption" color="secondary">
                                {chartLine}
                              </AppText>
                              <MoneyText
                                amount={point.y}
                                currencyCode={currencyCode}
                                variant="body"
                                weight="bold"
                              />
                            </View>
                            <View style={[styles.tooltipRow, { marginTop: 2 }]}>
                              <AppText variant="caption" color="secondary">
                                Change
                              </AppText>
                              <MoneyText
                                amount={changeFromStart}
                                currencyCode={currencyCode}
                                prefix={isPositive ? '+' : undefined}
                                variant="body"
                                weight="bold"
                                style={{ color: isPositive ? theme.income : theme.expense }}
                              />
                            </View>
                            {rollingPoint && (
                              <View style={[styles.tooltipRow, { marginTop: 2 }]}>
                                <AppText variant="caption" color="secondary">
                                  7d Avg
                                </AppText>
                                <MoneyText
                                  amount={rollingPoint.y}
                                  currencyCode={currencyCode}
                                  variant="body"
                                  weight="bold"
                                  style={{ color: theme.warning }}
                                />
                              </View>
                            )}
                          </View>
                        );
                      }}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <ScreenSectionHeader title="Activity" style={styles.sectionHeader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  periodRegion: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    gap: Spacing.md,
  },
  periodAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  categoryPeriodAmount: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  periodValue: {
    maxWidth: '100%',
    flexShrink: 0,
  },
  heroHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.md,
  },
  stat: {
    width: '50%',
    minWidth: 0,
    paddingRight: Spacing.sm,
    gap: Spacing.xs,
  },
  comparisonStat: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 0,
  },
  stackedStat: {
    width: '100%',
  },
  chartToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Size.touchTarget,
  },
  trendTitle: {
    flex: 1,
    minWidth: 0,
  },
  chartWrap: {
    marginTop: Spacing.sm,
    width: '100%',
  },
  tooltipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionHeader: {
    marginTop: Spacing.sm,
  },
  barContainer: {
    gap: Spacing.xs,
  },
});
