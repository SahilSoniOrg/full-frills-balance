import { LineChart } from '@/src/components/charts/LineChart';
import { useStsMoneyFormat } from '@/src/components/common/moneyFormat';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, withOpacity } from '@/src/constants';
import { Inline, Separator, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics-service';
import {
  SafeToSpendDataPoint,
  SafeToSpendProjection,
} from '@/src/services/simulation/safeToSpendDashboardProjection';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface SafeToSpendChartProps {
  projection: SafeToSpendProjection;
  safeToSpend: number;
  isOverCommitted: boolean;
  currencyCode: string;
  isLoading?: boolean;
}

export const SafeToSpendChart = ({
  projection,
  safeToSpend,
  isOverCommitted,
  currencyCode,
  isLoading = false,
}: SafeToSpendChartProps) => {
  const { theme } = useTheme();
  const labels = AppConfig.strings.dashboard.safeToSpendUi;
  const formatSts = useStsMoneyFormat(isLoading);

  const analyticsTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return () => {
      if (analyticsTimeoutRef.current) {
        clearTimeout(analyticsTimeoutRef.current);
      }
    };
  }, []);

  const historyPoints = projection?.history || [];
  const projectionPoints = projection?.projection || [];

  type SafeToSpendChartPoint = SafeToSpendDataPoint & { x: number; y: number; isHistory: boolean };
  const data: SafeToSpendChartPoint[] = [
    ...historyPoints.map(p => ({ ...p, x: p.timestamp, y: p.value, isHistory: true })),
    ...projectionPoints.map(p => ({ ...p, x: p.timestamp, y: p.value, isHistory: false })),
  ];

  const minX =
    data.length > 0 ? Math.min(...data.map(d => d.x)) : dayjs().subtract(7, 'day').valueOf();
  const maxX =
    data.length > 0
      ? Math.max(...data.map(d => d.x))
      : dayjs().add(AppConfig.defaults.safeToSpendDays, 'day').valueOf();

  const tickCount = AppConfig.defaults.chartTickCount;
  const xTicks = [];
  for (let i = 0; i < tickCount; i++) {
    xTicks.push(minX + ((maxX - minX) * i) / (tickCount - 1));
  }

  const extraHorizontalLines = [
    { value: 0, label: '0', color: theme.error, strokeDasharray: '2,2' },
    {
      value: safeToSpend,
      label: `${AppConfig.strings.dashboard.safeToSpendTitle}: ${formatSts(safeToSpend, currencyCode)}`,
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
                  backgroundColor: withOpacity(theme.success, Opacity.hover),
                  borderColor: withOpacity(theme.success, Opacity.active),
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
                backgroundColor: withOpacity(theme.success, Opacity.hover),
                borderColor: withOpacity(theme.success, Opacity.active),
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
          currencyCode={currencyCode}
          height={AppConfig.layout.safeToSpendChartHeight}
          color={isOverCommitted ? theme.error : theme.primary}
          xTicks={xTicks}
          formatXTick={x => dayjs(x).format('MMM D')}
          todayX={dayjs().endOf('day').valueOf()}
          extraHorizontalLines={extraHorizontalLines}
          avoidPointVertical={true}
          onPress={index => {
            if (index === -1) {
              if (analyticsTimeoutRef.current) {
                clearTimeout(analyticsTimeoutRef.current);
                analyticsTimeoutRef.current = null;
              }
              return;
            }
            const point = data[index];
            if (!point) return;

            if (analyticsTimeoutRef.current) {
              clearTimeout(analyticsTimeoutRef.current);
            }

            analyticsTimeoutRef.current = setTimeout(() => {
              analytics.trackFeatureUsage('safe_to_spend', 'chart_point_selected', {
                dayOffset: dayjs(point.x).diff(dayjs().startOf('day'), 'day'),
                isHistory: point.isHistory,
                hasDetails: (point.details?.length ?? 0) > 0,
              });
              analyticsTimeoutRef.current = null;
            }, 1000); // 1-second debounce to avoid tracking rapid scrubbing/swiping
          }}
          renderTooltipContent={index => {
            const point = data[index];
            if (!point) return null;

            const plannedDetails =
              point.details?.filter(
                d =>
                  d.context === 'PLANNED' ||
                  d.context === 'PLANNED_PAYMENT' ||
                  d.context === 'PLANNED_JOURNAL' ||
                  d.context === 'RESOLVED' ||
                  d.context?.includes('PLANNED'),
              ) || [];

            const plannedInflowTotal = plannedDetails
              .filter(d => d.type === 'INFLOW')
              .reduce((sum, d) => sum + d.amount, 0);

            const toBeSpentDetails =
              point.details?.filter(d => d.type === 'OUTFLOW' && d.context !== 'BUDGET') || [];

            const toBeSpentTotal = toBeSpentDetails.reduce((sum, d) => sum + d.amount, 0);

            return (
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
                      style={{ opacity: Opacity.strong }}
                    />
                  )}
                </Inline>

                <AppText variant="body" weight="bold" color={point.y < 0 ? 'error' : 'primary'}>
                  {formatSts(point.y, currencyCode)}
                </AppText>

                {((point.dailyBurn ?? 0) > 0 || (point.details?.length ?? 0) > 0) && (
                  <>
                    <Separator opacity={Opacity.hover} marginVertical="xs" />

                    {(point.dailyBurn ?? 0) > 0 && (
                      <View
                        style={{
                          backgroundColor: withOpacity(theme.error, Opacity.shadow),
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
                            Daily Burn: {formatSts(point.dailyBurn!, currencyCode)}
                          </AppText>
                        </Inline>
                      </View>
                    )}

                    {(plannedInflowTotal > 0 || toBeSpentTotal > 0) && (
                      <View
                        style={{
                          backgroundColor: withOpacity(theme.warning, Opacity.shadow),
                          paddingHorizontal: 6,
                          paddingVertical: 4,
                          borderRadius: 4,
                          marginBottom: 2,
                          gap: 2,
                        }}
                      >
                        {plannedInflowTotal > 0 && (
                          <Inline gap="xs" alignItems="center">
                            <AppIcon name="calendar" size={10} color={theme.success} />
                            <AppText
                              variant="caption"
                              weight="bold"
                              color="success"
                              style={{ fontSize: 10 }}
                            >
                              Planned Inflow:{' '}
                              {formatSts(plannedInflowTotal, currencyCode, { prefix: '+' })}
                            </AppText>
                          </Inline>
                        )}
                        {toBeSpentTotal > 0 && (
                          <Inline gap="xs" alignItems="center">
                            <AppIcon name="creditCard" size={10} color={theme.error} />
                            <AppText
                              variant="caption"
                              weight="bold"
                              color="error"
                              style={{ fontSize: 10 }}
                            >
                              To Be Spent:{' '}
                              {formatSts(toBeSpentTotal, currencyCode, { prefix: '-' })}
                            </AppText>
                          </Inline>
                        )}
                      </View>
                    )}

                    {point.details
                      ?.slice(0, AppConfig.defaults.maxTooltipDetails)
                      .map((detail, idx) => {
                        const isInflow = detail.type === 'INFLOW';
                        const isCcDate = detail.type === 'CC_DATE';

                        // Map context/type to consistent icons
                        let iconName: any = 'receipt';
                        if (detail.context === 'BUDGET') iconName = 'pieChart';
                        else if (
                          detail.context === 'PLANNED' ||
                          detail.context === 'PLANNED_PAYMENT' ||
                          detail.context === 'PLANNED_JOURNAL' ||
                          detail.context === 'RESOLVED'
                        )
                          iconName = 'calendar';
                        else if (detail.context === 'LIABILITY') iconName = 'creditCard';
                        else if (detail.context === 'TRANSFER') iconName = 'refresh';
                        else if (isCcDate) iconName = 'calendar';

                        const color = isInflow
                          ? theme.success
                          : detail.context === 'LIABILITY' ||
                              detail.context === 'BUDGET' ||
                              detail.context === 'RESOLVED' ||
                              detail.context === 'PLANNED' ||
                              detail.context === 'PLANNED_PAYMENT' ||
                              detail.context === 'PLANNED_JOURNAL'
                            ? theme.error
                            : theme.textSecondary;

                        return (
                          <Inline
                            key={idx}
                            space="md"
                            justifyContent="space-between"
                            alignItems="center"
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <AppIcon name={iconName} size={10} color={color} />
                              <AppText
                                variant="caption"
                                color="secondary"
                                numberOfLines={1}
                                style={{ fontSize: 10, opacity: Opacity.high }}
                              >
                                {detail.name}
                              </AppText>
                            </View>
                            {detail.amount !== 0 && (
                              <AppText
                                variant="caption"
                                weight="bold"
                                color={isInflow ? 'success' : 'error'}
                                style={{ fontSize: 10 }}
                              >
                                {formatSts(Math.abs(detail.amount), currencyCode, {
                                  prefix: isInflow ? '+' : '-',
                                })}
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
            );
          }}
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
