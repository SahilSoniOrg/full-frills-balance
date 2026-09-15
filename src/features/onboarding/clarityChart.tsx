import { LineChart } from '@/src/components/charts/LineChart';
import { AppText } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppConfig } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import { useState } from 'react';
import { View } from 'react-native';
import { findSafeToSpendChartPoint, type ClarityChartPoint } from './projectCashClarityDraft';

export function ClarityChart({
  points,
  safeToSpend,
  currency,
}: {
  readonly points: readonly ClarityChartPoint[];
  readonly safeToSpend: number;
  readonly currency: string;
}) {
  const { theme } = useTheme();
  const [width, setWidth] = useState(0);
  if (points.length === 0) return null;

  const data = points.map(point => ({ x: point.x, y: point.y, events: point.events }));
  const minX = data[0].x;
  const maxX = data[data.length - 1].x;
  const tickCount = AppConfig.defaults.chartTickCount;
  const xTicks = Array.from(
    { length: tickCount },
    (_, index) => minX + ((maxX - minX) * index) / (tickCount - 1),
  );
  const overdrawn = data.some(point => point.y < 0);
  const stsPoint = findSafeToSpendChartPoint(points, safeToSpend);
  const todayX = dayjs().endOf('day').valueOf();
  const stsIsToday = stsPoint != null && Math.abs(stsPoint.x - todayX) < 12 * 60 * 60 * 1000;

  return (
    <View
      onLayout={event => {
        const next = event.nativeEvent.layout.width;
        setWidth(previous => (previous === next ? previous : next));
      }}
    >
      {width > 0 ? (
        <LineChart
          data={data}
          width={width}
          currencyCode={currency}
          height={AppConfig.layout.safeToSpendChartHeight}
          color={overdrawn ? theme.error : theme.primary}
          xTicks={xTicks}
          formatXTick={x => dayjs(x).format('MMM D')}
          todayX={stsIsToday ? undefined : todayX}
          markedPoint={
            stsPoint
              ? {
                  x: stsPoint.x,
                  y: stsPoint.y,
                  label: copy.safeToSpend,
                  caption: dayjs(stsPoint.x).format('D MMM'),
                }
              : undefined
          }
          extraHorizontalLines={[
            { value: 0, label: '0', color: theme.error, strokeDasharray: '2,2' },
            {
              value: safeToSpend,
              color: theme.primary,
              strokeDasharray: '4,4',
            },
          ]}
          avoidPointVertical
          renderTooltipContent={index => {
            const point = data[index];
            if (!point) return null;
            const isSts = stsPoint != null && point.x === stsPoint.x;
            return (
              <Stack gap="xs">
                {isSts ? (
                  <AppText variant="caption" color="primary" weight="semibold">
                    {copy.safeToSpend}
                  </AppText>
                ) : null}
                <AppText variant="caption" color="secondary">
                  {dayjs(point.x).format('D MMM')}
                </AppText>
                <MoneyText
                  amount={point.y}
                  currencyCode={currency}
                  formatStyle="compact"
                  variant="body"
                  weight="semibold"
                  color={point.y < 0 ? 'error' : 'primary'}
                />
                {point.events.map((event, eventIndex) => (
                  <Box key={`${event.name}-${eventIndex}`}>
                    <AppText
                      variant="caption"
                      color={event.kind === 'INFLOW' ? 'income' : 'expense'}
                    >
                      {event.kind === 'INFLOW' ? '+' : '−'} {event.name}
                    </AppText>
                  </Box>
                ))}
              </Stack>
            );
          }}
        />
      ) : null}
    </View>
  );
}
