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
          height={AppConfig.layout.safeToSpendChartHeight}
          color={isOverCommitted ? theme.error : theme.primary}
          xTicks={xTicks}
          formatXTick={x => dayjs(x).format('MMM D')}
          todayX={dayjs().endOf('day').valueOf()}
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
          renderTooltipContent={index => {
            const point = data[index];
            if (!point) return null;
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
                  {formatValue(point.y)}
                </AppText>

                {((point as any).dailyBurn > 0 || ((point as any).details?.length || 0) > 0) && (
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
                            Daily Burn: {formatValue(point.dailyBurn!)}
                          </AppText>
                        </Inline>
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
                        else if (detail.context === 'PLANNED' || detail.context === 'RESOLVED')
                          iconName = 'calendar';
                        else if (detail.context === 'LIABILITY') iconName = 'creditCard';
                        else if (detail.context === 'TRANSFER') iconName = 'refresh';
                        else if (isCcDate) iconName = 'calendar';

                        const color = isInflow
                          ? theme.success
                          : detail.context === 'LIABILITY' ||
                              detail.context === 'BUDGET' ||
                              detail.context === 'RESOLVED'
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
                                {isInflow ? '+' : '-'}
                                {formatValue(Math.abs(detail.amount))}
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
