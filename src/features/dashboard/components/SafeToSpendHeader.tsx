import { Icon, IconButton } from '@/src/components/core';
import { AppConfig, ChromeMotion, Size } from '@/src/constants';
import { Column, Row, Text } from '@/src/design-system';
import { useStsMoneyFormat } from '@/src/components/shared/moneyFormat';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { MotiView } from 'moti';

interface SafeToSpendHeaderProps {
  isOverCommitted: boolean;
  isPositiveSafeToSpend: boolean;
  amount: number;
  currencyCode: string;
  loading?: boolean;
  infoDisabled?: boolean;
  onInfoPress: () => void;
}

export const SafeToSpendHeader = ({
  isOverCommitted,
  isPositiveSafeToSpend,
  amount,
  currencyCode,
  loading = false,
  infoDisabled = false,
  onInfoPress,
}: SafeToSpendHeaderProps) => {
  const { theme } = useTheme();
  const strings = AppConfig.strings.dashboard;
  const formatSts = useStsMoneyFormat(loading);
  const reduceMotion = useReducedMotion();
  const settle = !reduceMotion && !loading;

  const amountText = (
    <Text
      testID="safe-to-spend-amount"
      variant="hero"
      color={isOverCommitted ? 'error' : isPositiveSafeToSpend ? 'success' : undefined}
      weight="bold"
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.55}
      ellipsizeMode="tail"
    >
      {formatSts(amount, currencyCode)}
    </Text>
  );

  return (
    <Column gap="xs">
      <Row align="center" justify="space-between" gap="sm">
        <Text
          variant="xs"
          weight="bold"
          color={isOverCommitted ? 'error' : 'secondary'}
          style={{ letterSpacing: 1.2, textTransform: 'uppercase', flex: 1 }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {isOverCommitted ? strings.shortfall : strings.safeToSpendTitle}
        </Text>
        <IconButton
          name={Icon.HelpCircle}
          variant="clear"
          size={Size.sm}
          iconColor={isOverCommitted ? theme.error : theme.textSecondary}
          onPress={onInfoPress}
          disabled={infoDisabled}
          accessibilityLabel="Open safe-to-spend calculation info"
        />
      </Row>

      {settle ? (
        <MotiView
          from={{
            opacity: 0,
            translateY: ChromeMotion.settleRisePx,
            scale: ChromeMotion.panelFromScale,
          }}
          animate={{ opacity: 1, translateY: 0, scale: 1 }}
          transition={ChromeMotion.sheetSpring}
        >
          {amountText}
        </MotiView>
      ) : (
        amountText
      )}

      <Text
        variant="xs"
        color={isOverCommitted ? 'error' : 'secondary'}
        opacity={0.8}
        numberOfLines={3}
      >
        {isOverCommitted ? strings.shortfallSubtitle : strings.afterObligations}
      </Text>
    </Column>
  );
};
