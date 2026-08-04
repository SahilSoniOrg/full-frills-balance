import { MoneyText } from '@/src/components/common/MoneyText';
import { AppText, ColoredDot } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Column, Row } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { TouchableOpacity } from 'react-native';

interface SafeToSpendBreakdownBarProps {
  effectiveTotal: number;
  committedTotal: number;
  committedLiabilities: number;
  safeToSpend: number;
  currencyCode: string;
  loading?: boolean;
  onLegendPress: (item: 'safe' | 'committed' | 'debts') => void;
}

export const SafeToSpendBreakdownBar = ({
  effectiveTotal,
  committedTotal,
  committedLiabilities,
  safeToSpend,
  currencyCode,
  loading = false,
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
        <TouchableOpacity onPress={() => onLegendPress('safe')} style={{ flexShrink: 1 }}>
          <Row align="center" gap="xs">
            <ColoredDot color={theme.primary} />
            <Row gap="xs" style={{ flexShrink: 1 }}>
              <AppText variant="caption" color="secondary" numberOfLines={1}>
                {labels.safePrefix}
              </AppText>
              <MoneyText
                amount={safeToSpend}
                currencyCode={currencyCode}
                formatStyle="sts"
                loading={loading}
                variant="caption"
                weight="bold"
                color="primary"
                numberOfLines={1}
              />
            </Row>
          </Row>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onLegendPress('committed')} style={{ flexShrink: 1 }}>
          <Row align="center" gap="xs">
            <ColoredDot color={theme.warning} />
            <Row gap="xs" style={{ flexShrink: 1 }}>
              <AppText variant="caption" color="secondary" numberOfLines={1}>
                {labels.committedPrefix}
              </AppText>
              <MoneyText
                amount={committedTotal}
                currencyCode={currencyCode}
                formatStyle="sts"
                loading={loading}
                variant="caption"
                weight="bold"
                color="warning"
                numberOfLines={1}
              />
            </Row>
          </Row>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onLegendPress('debts')} style={{ flexShrink: 1 }}>
          <Row align="center" gap="xs">
            <ColoredDot color={theme.error} />
            <Row gap="xs" style={{ flexShrink: 1 }}>
              <AppText variant="caption" color="secondary" numberOfLines={1}>
                {labels.debtsPrefix}
              </AppText>
              <MoneyText
                amount={committedLiabilities}
                currencyCode={currencyCode}
                formatStyle="sts"
                loading={loading}
                variant="caption"
                weight="bold"
                color="error"
                numberOfLines={1}
              />
            </Row>
          </Row>
        </TouchableOpacity>
      </Row>
    </Column>
  );
};
