import { useStsMoneyFormat } from '@/src/components/common/moneyFormat';
import { AppText, ColoredDot } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import type { ComponentVariant } from '@/src/utils/style-helpers';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

const METRIC_COLUMNS_MIN_WIDTH = 560;

export type SafeToSpendMetricKey = 'safe' | 'committed' | 'debts';

export interface SafeToSpendMetric {
  key: SafeToSpendMetricKey;
  label: string;
  value: string;
  dotColor: string;
  textColor: ComponentVariant;
}

interface SafeToSpendBreakdownMetricsProps {
  safeToSpend: number;
  committedTotal: number;
  committedLiabilities: number;
  currencyCode: string;
  loading?: boolean;
  detailsReady: boolean;
  onPress: (item: SafeToSpendMetricKey) => void;
}

export function SafeToSpendBreakdownMetrics({
  safeToSpend,
  committedTotal,
  committedLiabilities,
  currencyCode,
  loading = false,
  detailsReady,
  onPress,
}: SafeToSpendBreakdownMetricsProps) {
  const { theme } = useTheme();
  const labels = AppConfig.strings.dashboard.safeToSpendUi;
  const formatSts = useStsMoneyFormat(loading);
  const [contentWidth, setContentWidth] = useState(0);
  const useColumns = contentWidth >= METRIC_COLUMNS_MIN_WIDTH;
  const items: SafeToSpendMetric[] = [
    {
      key: 'safe',
      label: labels.safePrefix,
      value: formatSts(safeToSpend, currencyCode),
      dotColor: theme.primary,
      textColor: 'primary',
    },
    {
      key: 'committed',
      label: labels.committedPrefix,
      value: formatSts(committedTotal, currencyCode),
      dotColor: theme.warning,
      textColor: 'warning',
    },
    {
      key: 'debts',
      label: labels.debtsPrefix,
      value: formatSts(committedLiabilities, currencyCode),
      dotColor: theme.error,
      textColor: 'error',
    },
  ];

  return (
    <View
      testID="safe-to-spend-breakdown-metrics"
      style={styles.container}
      onLayout={event => {
        const width = event.nativeEvent.layout.width;
        setContentWidth(previousWidth => (previousWidth === width ? previousWidth : width));
      }}
    >
      <Row gap={useColumns ? 'xl' : 'sm'} wrap={useColumns ? undefined : 'wrap'}>
        {items.map(item => (
          <TouchableOpacity
            key={item.key}
            onPress={() => onPress(item.key)}
            disabled={!detailsReady}
            style={useColumns ? styles.columnMetric : styles.compactMetric}
            accessibilityRole="button"
          >
            {useColumns ? (
              <Column gap="xs">
                <Row align="center" gap="xs">
                  <ColoredDot color={item.dotColor} />
                  <AppText variant="caption" color="secondary" numberOfLines={1}>
                    {item.label}
                  </AppText>
                </Row>
                <AppText
                  variant="subheading"
                  weight="bold"
                  color={item.textColor}
                  numberOfLines={1}
                >
                  {item.value}
                </AppText>
              </Column>
            ) : (
              <Row align="center" gap="xs">
                <ColoredDot color={item.dotColor} />
                <AppText variant="caption" color="secondary" numberOfLines={1}>
                  {item.label}
                </AppText>
                <AppText variant="caption" weight="bold" color={item.textColor} numberOfLines={1}>
                  {item.value}
                </AppText>
              </Row>
            )}
          </TouchableOpacity>
        ))}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  columnMetric: {
    flex: 1,
    minWidth: 0,
  },
  compactMetric: {
    flexShrink: 1,
  },
});
