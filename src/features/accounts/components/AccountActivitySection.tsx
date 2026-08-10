import { MoneyText } from '@/src/components/common/MoneyText';
import { LineChart } from '@/src/components/charts/LineChart';
import { DateRangeTrigger } from '@/src/components/common/DateRangeTrigger';
import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { AppText, IconButton } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import type { AccountActivitySectionModel } from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { useTheme } from '@/src/hooks/use-theme';
import { formatShortDate } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import { StyleSheet, View } from 'react-native';

export type { AccountActivitySectionModel as AccountActivitySectionProps };

export function AccountActivitySection({
  accountType,
  reconciledAtMs,
  dateRange,
  onShowDatePicker,
  onPreviousPeriod,
  onNextPeriod,
  chartData,
  rollingAverageData,
  xTicks,
  periodMetrics,
  currencyCode,
  onReconcile,
  unreconciledCount,
}: AccountActivitySectionModel) {
  const { theme } = useTheme();
  const reconcileColor =
    unreconciledCount > 0
      ? theme.warning
      : reconciledAtMs != null
        ? theme.success
        : theme.textSecondary;

  return (
    <>
      <ScreenSectionHeader
        title="Activity"
        style={styles.sectionHeader}
        action={
          <View style={styles.activityActions}>
            {onReconcile ? (
              <IconButton
                name="checkCircle"
                onPress={onReconcile}
                variant="surface"
                iconColor={reconcileColor}
                testID="reconcile-button"
                accessibilityLabel={
                  unreconciledCount > 0
                    ? `Reconcile account, ${unreconciledCount} unreconciled`
                    : 'Reconcile account'
                }
              />
            ) : null}
            <DateRangeTrigger
              range={dateRange}
              onPress={onShowDatePicker}
              onPrevious={onPreviousPeriod}
              onNext={onNextPeriod}
            />
          </View>
        }
      />

      {chartData.length > 0 ? (
        <LineChart
          data={chartData}
          currencyCode={currencyCode}
          secondaryData={rollingAverageData}
          secondaryColor={theme.warning}
          xTicks={xTicks}
          formatXTick={formatShortDate}
          avoidPointVertical={true}
          renderTooltipContent={index => {
            const point = chartData[index];
            const rollingPoint = rollingAverageData[index];
            const startPoint = chartData[0];

            if (!point || !startPoint) return null;

            const changeFromStart = point.y - startPoint.y;
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
                    Balance
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

      <View style={styles.metricsContainer}>
        <View style={styles.metricItem}>
          <AppText variant="caption" color="secondary">
            {accountType === 'ASSET'
              ? 'Total In'
              : accountType === 'LIABILITY' || accountType === 'CREDIT_CARD'
                ? 'Total Spent'
                : 'Total In'}
          </AppText>
          <MoneyText
            amount={periodMetrics.totalIncrease}
            currencyCode={currencyCode}
            variant="heading"
            color="income"
            loading={periodMetrics.isLoading}
          />
        </View>
        <View style={styles.metricItem}>
          <AppText variant="caption" color="secondary">
            {accountType === 'ASSET'
              ? 'Total Out'
              : accountType === 'LIABILITY' || accountType === 'CREDIT_CARD'
                ? 'Total Paid'
                : 'Total Out'}
          </AppText>
          <MoneyText
            amount={periodMetrics.totalDecrease}
            currencyCode={currencyCode}
            variant="heading"
            color="expense"
            loading={periodMetrics.isLoading}
          />
        </View>
        {periodMetrics.dailyAverage !== null ? (
          <View style={styles.metricItem}>
            <AppText variant="caption" color="secondary">
              Daily Avg
            </AppText>
            <MoneyText
              amount={periodMetrics.dailyAverage}
              currencyCode={currencyCode}
              variant="heading"
              color={periodMetrics.dailyAverage < 0 ? 'expense' : 'income'}
              loading={periodMetrics.isLoading}
            />
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    marginBottom: Spacing.sm,
  },
  activityActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tooltipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
