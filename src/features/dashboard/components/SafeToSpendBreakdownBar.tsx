import { AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Column, Row } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { TouchableOpacity } from 'react-native';

interface SafeToSpendBreakdownBarProps {
  effectiveTotal: number;
  committedTotal: number;
  committedLiabilities: number;
  safeToSpend: number;
  displaySafe: string | React.ReactNode;
  displayCommitted: string | React.ReactNode;
  displayDebts: string | React.ReactNode;
  onLegendPress: (item: 'safe' | 'committed' | 'debts') => void;
}

export const SafeToSpendBreakdownBar = ({
  effectiveTotal,
  committedTotal,
  committedLiabilities,
  safeToSpend,
  displaySafe,
  displayCommitted,
  displayDebts,
  onLegendPress,
}: SafeToSpendBreakdownBarProps) => {
  const { theme } = useTheme();
  const labels = AppConfig.strings.dashboard.safeToSpendUi;

  if (effectiveTotal <= 0) {
    return (
      <Box paddingVertical="sm" alignItems="center">
        <AppText variant="caption" color="secondary">
          {AppConfig.strings.dashboard.noDataForBreakdown}
        </AppText>
      </Box>
    );
  }

  return (
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
        {committedTotal > 0 && (
          <Box height="100%" flex={committedTotal} unsafe_backgroundRaw={theme.warning} />
        )}
        {committedLiabilities > 0 && (
          <Box height="100%" flex={committedLiabilities} unsafe_backgroundRaw={theme.error} />
        )}
        {safeToSpend > 0 && (
          <Box height="100%" flex={safeToSpend} unsafe_backgroundRaw={theme.primary} />
        )}
      </Box>

      <Row gap="sm" wrap="wrap" justify="space-between">
        <TouchableOpacity onPress={() => onLegendPress('safe')}>
          <Row align="center" gap="xs">
            <Box width={8} height={8} borderRadius="full" unsafe_backgroundRaw={theme.primary} />
            <Row gap="xs">
              <AppText variant="caption" color="secondary">
                {labels.safePrefix}
              </AppText>
              <AppText variant="caption" weight="bold" color="primary">
                {displaySafe}
              </AppText>
            </Row>
          </Row>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onLegendPress('committed')}>
          <Row align="center" gap="xs">
            <Box width={8} height={8} borderRadius="full" unsafe_backgroundRaw={theme.warning} />
            <Row gap="xs">
              <AppText variant="caption" color="secondary">
                {labels.committedPrefix}
              </AppText>
              <AppText variant="caption" weight="bold" color="warning">
                {displayCommitted}
              </AppText>
            </Row>
          </Row>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onLegendPress('debts')}>
          <Row align="center" gap="xs">
            <Box width={8} height={8} borderRadius="full" unsafe_backgroundRaw={theme.error} />
            <Row gap="xs">
              <AppText variant="caption" color="secondary">
                {labels.debtsPrefix}
              </AppText>
              <AppText variant="caption" weight="bold" color="error">
                {displayDebts}
              </AppText>
            </Row>
          </Row>
        </TouchableOpacity>
      </Row>
    </Column>
  );
};
