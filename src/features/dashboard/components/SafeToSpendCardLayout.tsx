import { Stack, Inline, Separator } from '@/src/design-system';
import React, { useState } from 'react';
import { View } from 'react-native';

const TWO_COLUMN_MIN_WIDTH = 600;

interface SafeToSpendCardLayoutProps {
  summary: React.ReactNode;
  breakdown: React.ReactNode;
  metrics: React.ReactNode;
  chart: React.ReactNode;
  warning?: React.ReactNode;
}

export function SafeToSpendCardLayout({
  summary,
  breakdown,
  metrics,
  chart,
  warning,
}: SafeToSpendCardLayoutProps) {
  const [contentWidth, setContentWidth] = useState(0);
  const useTwoColumns = Boolean(chart) && contentWidth >= TWO_COLUMN_MIN_WIDTH;

  return (
    <View
      testID="safe-to-spend-card-layout"
      style={{ width: '100%' }}
      onLayout={event => {
        const width = event.nativeEvent.layout.width;
        setContentWidth(previousWidth => (previousWidth === width ? previousWidth : width));
      }}
    >
      {useTwoColumns ? (
        <View testID="safe-to-spend-card-layout-wide">
          <Stack gap="md">
            <Inline gap="xl" align="stretch" style={{ minHeight: 0 }}>
              <View style={{ flex: 2, minWidth: 0 }}>
                <Stack gap="md">
                  {summary}
                  {warning}
                  {breakdown}
                </Stack>
              </View>
              <View style={{ flex: 3, minWidth: 0 }}>{chart}</View>
            </Inline>
            {metrics}
          </Stack>
        </View>
      ) : (
        <View testID="safe-to-spend-card-layout-stacked">
          <Stack gap="sm">
            {summary}
            {warning}
            {breakdown || metrics ? (
              <Stack gap="xs">
                {breakdown}
                {metrics}
              </Stack>
            ) : null}
            {chart ? (
              <Stack gap="sm">
                {breakdown ? <Separator /> : null}
                {chart}
                <Separator />
              </Stack>
            ) : (
              <Separator />
            )}
          </Stack>
        </View>
      )}
    </View>
  );
}
