import { LineChart } from '@/src/components/charts/LineChart';
import { useStsMoneyFormat } from '@/src/components/common/moneyFormat';
import { AppIcon, AppSurface, AppText, ColoredDot } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, withOpacity } from '@/src/constants';
import { Box, Column, Row, Text } from '@/src/design-system';
import type { SafeToSpendProjection } from '@/src/services/simulation/safeToSpendDashboardProjection';
import {
  SAFE_TO_SPEND_PREVIEW,
  SafeToSpendPreviewFixture,
} from '@/src/features/onboarding/fixtures/safeToSpendPreview';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import React from 'react';
import { View } from 'react-native';

type OnboardingStsPreviewProps = {
  currencyCode: string;
  fixture?: SafeToSpendPreviewFixture;
};

/**
 * Self-contained Safe-to-Spend visual for onboarding theme selection.
 * Does not import dashboard SafeToSpendCard or simulation pipelines.
 */
export function OnboardingStsPreview({
  currencyCode,
  fixture = SAFE_TO_SPEND_PREVIEW,
}: OnboardingStsPreviewProps) {
  const { theme } = useTheme();
  const strings = AppConfig.strings.dashboard;
  const labels = strings.safeToSpendUi;
  const {
    safeToSpend,
    committedTotal,
    committedLiabilities,
    isOverCommitted,
    isPositiveSafeToSpend,
    sparklineNorms,
  } = fixture;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formattedSafeToSpend = formatCurrency(safeToSpend);
  const formattedCommitted = formatCurrency(committedTotal);
  const formattedDebts = formatCurrency(committedLiabilities);

  const effectiveTotal = committedTotal + committedLiabilities + Math.max(safeToSpend, 0);
  const today = dayjs().endOf('day');
  const todayIndex = Math.floor(sparklineNorms.length / 2);
  const chartPoints = sparklineNorms.map((norm, index) => ({
    timestamp: today.add(index - todayIndex, 'day').valueOf(),
    value: Math.round((norm - 0.5) * safeToSpend * 0.35 + safeToSpend),
    isProjected: index >= todayIndex,
  }));
  const projection = {
    history: chartPoints.filter(point => !point.isProjected),
    projection: chartPoints.filter(point => point.isProjected),
    safeDaysCount: AppConfig.defaults.safeToSpendDays,
    safeToSpend,
  };

  return (
    <AppSurface
      elevation="none"
      background="transparent"
      paddingHorizontal="none"
      paddingVertical="sm"
    >
      <Column gap="lg">
        <Column gap="xs">
          <Text
            variant="xs"
            weight="bold"
            color={isOverCommitted ? 'error' : 'secondary'}
            style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}
            numberOfLines={1}
          >
            {isOverCommitted ? strings.shortfall : strings.safeToSpendTitle}
          </Text>
          <Text
            variant="hero"
            color={isOverCommitted ? 'error' : isPositiveSafeToSpend ? 'success' : undefined}
            weight="bold"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
          >
            {formattedSafeToSpend}
          </Text>
          <Text variant="xs" color={isOverCommitted ? 'error' : 'secondary'} opacity={0.8}>
            {isOverCommitted ? strings.shortfallSubtitle : strings.afterObligations}
          </Text>
        </Column>

        {effectiveTotal > 0 ? (
          <Column gap="md">
            <Box
              background="pureInverse"
              backgroundOpacity="active"
              height={10}
              borderRadius="full"
              flexDirection="row"
              overflow="hidden"
              marginBottom="md"
            >
              {committedTotal > 0 ? (
                <Box height="100%" flex={committedTotal} unsafe_backgroundRaw={theme.warning} />
              ) : null}
              {committedLiabilities > 0 ? (
                <Box height="100%" flex={committedLiabilities} unsafe_backgroundRaw={theme.error} />
              ) : null}
              {safeToSpend > 0 ? (
                <Box height="100%" flex={safeToSpend} unsafe_backgroundRaw={theme.primary} />
              ) : null}
            </Box>

            <Row gap="sm" wrap="wrap" justify="space-between">
              <Row align="center" gap="xs" style={{ flexShrink: 1 }}>
                <ColoredDot color={theme.primary} />
                <AppText variant="caption" color="secondary" numberOfLines={1}>
                  {labels.safePrefix}
                </AppText>
                <AppText variant="caption" weight="bold" color="primary" numberOfLines={1}>
                  {formattedSafeToSpend}
                </AppText>
              </Row>
              <Row align="center" gap="xs" style={{ flexShrink: 1 }}>
                <ColoredDot color={theme.warning} />
                <AppText variant="caption" color="secondary" numberOfLines={1}>
                  {labels.committedPrefix}
                </AppText>
                <AppText variant="caption" weight="bold" color="warning" numberOfLines={1}>
                  {formattedCommitted}
                </AppText>
              </Row>
              <Row align="center" gap="xs" style={{ flexShrink: 1 }}>
                <ColoredDot color={theme.error} />
                <AppText variant="caption" color="secondary" numberOfLines={1}>
                  {labels.debtsPrefix}
                </AppText>
                <AppText variant="caption" weight="bold" color="error" numberOfLines={1}>
                  {formattedDebts}
                </AppText>
              </Row>
            </Row>
          </Column>
        ) : null}

        <View pointerEvents="none">
          <OnboardingProjectionChart
            projection={projection}
            safeToSpend={safeToSpend}
            isOverCommitted={isOverCommitted}
            currencyCode={currencyCode}
          />
        </View>
      </Column>
    </AppSurface>
  );
}

function OnboardingProjectionChart({
  projection,
  safeToSpend,
  isOverCommitted,
  currencyCode,
}: {
  projection: SafeToSpendProjection;
  safeToSpend: number;
  isOverCommitted: boolean;
  currencyCode: string;
}) {
  const { theme } = useTheme();
  const formatSts = useStsMoneyFormat(false);
  const [chartWidth, setChartWidth] = React.useState(0);
  const data = [...projection.history, ...projection.projection].map(point => ({
    x: point.timestamp,
    y: point.value,
    isProjected: point.isProjected,
  }));
  const minX = data[0]?.x ?? dayjs().subtract(7, 'day').valueOf();
  const maxX = data[data.length - 1]?.x ?? dayjs().add(30, 'day').valueOf();
  const tickCount = AppConfig.defaults.chartTickCount;
  const xTicks = Array.from(
    { length: tickCount },
    (_, index) => minX + ((maxX - minX) * index) / (tickCount - 1),
  );
  const chartColor = isOverCommitted ? theme.error : theme.primary;

  return (
    <View
      style={{ width: '100%' }}
      onLayout={event => setChartWidth(event.nativeEvent.layout.width)}
    >
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
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.xs,
            paddingVertical: 2,
            paddingHorizontal: 6,
            backgroundColor: withOpacity(theme.success, Opacity.hover),
            borderColor: withOpacity(theme.success, Opacity.active),
            borderWidth: 1,
            borderRadius: 100,
          }}
        >
          <AppIcon name="checkCircle" fallbackIcon="checkCircle" size={12} color={theme.success} />
          <AppText variant="caption" weight="bold" color="success" style={{ fontSize: 10 }}>
            Safe for {AppConfig.defaults.safeToSpendDays}d
          </AppText>
        </View>
      </View>
      {chartWidth > 0 ? (
        <LineChart
          data={data}
          width={chartWidth}
          height={AppConfig.layout.safeToSpendChartHeight}
          currencyCode={currencyCode}
          color={chartColor}
          xTicks={xTicks}
          formatXTick={x => dayjs(x).format('MMM D')}
          todayX={todayX()}
          extraHorizontalLines={[
            { value: 0, label: '0', color: theme.error, strokeDasharray: '2,2' },
            {
              value: safeToSpend,
              label: `${AppConfig.strings.dashboard.safeToSpendTitle}: ${formatSts(safeToSpend, currencyCode)}`,
              color: chartColor,
              strokeDasharray: '4,4',
            },
          ]}
          avoidPointVertical
        />
      ) : null}
    </View>
  );
}

function todayX(): number {
  return dayjs().endOf('day').valueOf();
}
