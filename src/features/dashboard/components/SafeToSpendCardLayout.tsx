import { Column, Row, Separator } from '@/src/design-system';
import React, { useState } from 'react';
import { View } from 'react-native';

const TWO_COLUMN_MIN_WIDTH = 600;

interface SafeToSpendCardLayoutProps {
  summary: React.ReactNode;
  breakdown: React.ReactNode;
  metrics: React.ReactNode;
  chart: React.ReactNode;
}

export function SafeToSpendCardLayout({
  summary,
  breakdown,
  metrics,
  chart,
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
          <Column gap="lg">
            <Row gap="xl" align="stretch" style={{ minHeight: 0 }}>
              <View style={{ flex: 2, minWidth: 0 }}>
                <Column gap="lg">
                  {summary}
                  {breakdown}
                </Column>
              </View>
              <View style={{ flex: 3, minWidth: 0 }}>{chart}</View>
            </Row>
            {metrics}
          </Column>
        </View>
      ) : (
        <View testID="safe-to-spend-card-layout-stacked">
          <Column gap="lg">
            {summary}
            {breakdown}
            {metrics}
            {chart ? (
              <>
                {breakdown ? <Separator /> : null}
                {chart}
                <Separator />
              </>
            ) : null}
          </Column>
        </View>
      )}
    </View>
  );
}
