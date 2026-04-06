import { LineChart } from '@/src/components/charts/LineChart';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, withOpacity } from '@/src/constants';
import { Inline, Separator, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics-service';
import {
  SafeToSpendDataPoint,
  SafeToSpendProjection,
} from '@/src/services/notification/NotificationService';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface SafeToSpendChartProps {
  projection: SafeToSpendProjection;
  safeToSpend: number;
  isOverCommitted: boolean;
  isPrivacyMode: boolean;
  formatValue: (val: number) => string | React.ReactNode;
}

export const SafeToSpendChart = ({
  projection,
  safeToSpend,
  isOverCommitted,
  isPrivacyMode,
  formatValue,
}: SafeToSpendChartProps) => {
  const { theme } = useTheme();
  const labels = AppConfig.strings.dashboard.safeToSpendUi;

  const historyPoints = projection?.history || [];
  const projectionPoints = projection?.projection || [];

  type SafeToSpendChartPoint = SafeToSpendDataPoint & { x: number; y: number; isHistory: boolean };
  const data: SafeToSpendChartPoint[] = [
    ...historyPoints.map(p => ({ ...p, x: p.timestamp, y: p.value, isHistory: true })),
    ...projectionPoints.map(p => ({ ...p, x: p.timestamp, y: p.value, isHistory: false })),
  ];

  const minX =
    data.length > 0 ? Math.min(...data.map(d => d.x)) : dayjs().subtract(7, 'day').valueOf();
  const maxX = data.length > 0 ? Math.max(...data.map(d => d.x)) : dayjs().add(30, 'day').valueOf();

  const tickCount = AppConfig.defaults.chartTickCount;
  const xTicks = [];
  for (let i = 0; i < tickCount; i++) {
    xTicks.push(minX + ((maxX - minX) * i) / (tickCount - 1));
  }

  const extraHorizontalLines = [
    { value: 0, label: '0', color: theme.error, strokeDasharray: '2,2' },
    {
      value: safeToSpend,
      label: `${AppConfig.strings.dashboard.safeToSpendTitle}: ${formatValue(safeToSpend)}`,
      color: theme.primary,
      strokeDasharray: '4,4',
    },
  ];

  return (
    <View style={{ overflow: 'visible', zIndex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: Spacing.md,
        }}
      >
        <AppText variant="body" weight="medium">
          {`Projection (${AppConfig.defaults.safeToSpendDays}-day)`}
        </AppText>
        {!isOverCommitted &&
          projection?.safeDaysCount !== null &&
          projection?.safeDaysCount !== undefined && (
            <View
              style={[
                styles.safetyMetricContainer,
                {
                  marginTop: 0,
                  paddingVertical: 2,
                  paddingHorizontal: 6,
                  backgroundColor: withOpacity(theme.success, 0.1),
                  borderColor: withOpacity(theme.success, 0.2),
                  borderWidth: 1,
                },
              ]}
            >
              <AppIcon
                name="checkCircle"
                fallbackIcon="checkCircle"
                size={12}
                color={theme.success}
              />
              <AppText variant="caption" weight="bold" color="success" style={{ fontSize: 10 }}>
                Safe for{' '}
                {projection.safeDaysCount > AppConfig.defaults.safeToSpendDaysCap
                  ? `${AppConfig.defaults.safeToSpendDaysCap}+`
                  : projection.safeDaysCount}{' '}
                {projection.safeDaysCount === 1 ? 'd' : 'd'}
              </AppText>
            </View>
          )}
        {!isOverCommitted && projection?.safeDaysCount === null && (
          <View
            style={[
              styles.safetyMetricContainer,
              {
                marginTop: 0,
                paddingVertical: 2,
                paddingHorizontal: 6,
                backgroundColor: withOpacity(theme.success, 0.1),
                borderColor: withOpacity(theme.success, 0.2),
                borderWidth: 1,
              },
            ]}
          >
            <AppIcon
              name="checkCircle"
              fallbackIcon="checkCircle"
              size={12}
              color={theme.success}
            />
            <AppText variant="caption" weight="bold" color="success" style={{ fontSize: 10 }}>
              {labels.financiallySecure}
            </AppText>
          </View>
        )}
      </View>
      <View style={{ overflow: 'visible' }}>
        <LineChart
          data={data}
          height={AppConfig.layout.safeToSpendChartHeight}
          color={isOverCommitted ? theme.error : theme.primary}
          xTicks={xTicks}
          formatXTick={x => dayjs(x).format('MMM D')}
          todayX={dayjs().startOf('day').valueOf()}
          hideLabels={isPrivacyMode}
          extraHorizontalLines={extraHorizontalLines}
          avoidPointVertical={true}
          onPress={index => {
            if (index === -1) return;
            const point = data[index];
            if (!point) return;

            analytics.trackFeatureUsage('safe_to_spend', 'chart_point_selected', {
              dayOffset: dayjs(point.x).diff(dayjs().startOf('day'), 'day'),
              isHistory: point.isHistory,
              hasDetails: (point as any).details?.length > 0,
            });
          }}
          renderTooltipContent={point => (
            // <ChartTooltip style={{ minWidth: 100 }}>
            <Stack gap="xs">
              <Inline justifyContent="space-between" alignItems="center">
                <AppText variant="caption" color="secondary" style={{ fontSize: 10 }}>
                  {dayjs(point.x).format('MMM D, YYYY')}
                </AppText>
                {!point.isHistory && (
                  <AppIcon
                    name="trendingUpDown"
                    size={12}
                    color={theme.primary}
                    style={{ opacity: 0.8 }}
                  />
                )}
              </Inline>

              <AppText variant="body" weight="bold" color={point.y < 0 ? 'error' : 'primary'}>
                {formatValue(point.y)}
              </AppText>

              {((point as any).dailyBurn > 0 || ((point as any).details?.length || 0) > 0) && (
                <>
                  <Separator opacity={0.1} marginVertical="xs" />

                  {(point.dailyBurn ?? 0) > 0 && (
                    <View
                      style={{
                        backgroundColor: withOpacity(theme.error, 0.08),
                        paddingHorizontal: 6,
                        paddingVertical: 4,
                        borderRadius: 4,
                        marginBottom: 2,
                      }}
                    >
                      <Inline gap="xs" alignItems="center">
                        <AppIcon name="flame" size={10} color={theme.error} />
                        <AppText
                          variant="caption"
                          weight="bold"
                          color="error"
                          style={{ fontSize: 10 }}
                        >
                          Daily Burn: {formatValue(point.dailyBurn!)}
                        </AppText>
                      </Inline>
                    </View>
                  )}

                  {point.details
                    ?.slice(0, AppConfig.defaults.maxTooltipDetails)
                    .map((detail, idx) => {
                      const isTotalInflow = detail.type === 'INFLOW';
                      const isTotalOutflow = detail.type === 'OUTFLOW';
                      const isCcDate = detail.type === 'CC_DATE';

                      let iconName: any = 'receipt';
                      let color = theme.textSecondary;
                      if (isTotalInflow) {
                        iconName = 'trendingUp';
                        color = theme.success;
                      } else if (isTotalOutflow) {
                        iconName = 'trendingDown';
                        color = theme.error;
                      } else if (isCcDate) {
                        iconName = 'calendar';
                        color = theme.warning;
                      }

                      return (
                        <Inline
                          key={idx}
                          space="md"
                          justifyContent="space-between"
                          alignItems="center"
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <AppIcon name={iconName} size={10} color={color} />
                            <AppText
                              variant="caption"
                              color="secondary"
                              numberOfLines={1}
                              style={{ fontSize: 10, opacity: 0.9 }}
                            >
                              {detail.name}
                            </AppText>
                            {detail.context && (
                              <View
                                style={{
                                  backgroundColor: withOpacity(color, Opacity.hover),
                                  paddingHorizontal: 4,
                                  paddingVertical: 1,
                                  borderRadius: 3,
                                }}
                              >
                                <AppText
                                  variant="caption"
                                  style={{ fontSize: 8, color, opacity: 0.9 }}
                                  weight="bold"
                                >
                                  {detail.context}
                                </AppText>
                              </View>
                            )}
                          </View>
                          {detail.amount !== 0 && (
                            <AppText
                              variant="caption"
                              weight="bold"
                              color={
                                isTotalInflow ? 'success' : isTotalOutflow ? 'error' : 'primary'
                              }
                              style={{ fontSize: 10 }}
                            >
                              {isTotalOutflow ? '-' : isTotalInflow ? '+' : ''}
                              {formatValue(detail.amount)}
                            </AppText>
                          )}
                        </Inline>
                      );
                    })}
                  {(point.details?.length || 0) > AppConfig.defaults.maxTooltipDetails && (
                    <AppText
                      variant="caption"
                      color="secondary"
                      style={{ fontSize: 9, marginLeft: 14 }}
                    >
                      + {point.details!.length - AppConfig.defaults.maxTooltipDetails} more
                    </AppText>
                  )}
                </>
              )}
            </Stack>
            // </ChartTooltip>
          )}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  projectionContainer: {
    overflow: 'hidden',
  },
  safetyMetricContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 100,
  },
});
