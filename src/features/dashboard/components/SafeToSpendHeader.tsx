import { Icon, IconButton, AppText } from '@/src/components/core';
import { AppConfig, ChromeMotion, Size, Typography } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { useStsMoneyFormat } from '@/src/components/shared/moneyFormat';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { MotiView } from 'moti';
import { useWindowDimensions } from 'react-native';

interface SafeToSpendHeaderProps {
  isOverCommitted: boolean;
  isPositiveSafeToSpend: boolean;
  amount: number;
  currencyCode: string;
  loading?: boolean;
  infoDisabled?: boolean;
  forecastDays?: number;
  onInfoPress: () => void;
}

export const SafeToSpendHeader = ({
  isOverCommitted,
  isPositiveSafeToSpend,
  amount,
  currencyCode,
  loading = false,
  infoDisabled = false,
  forecastDays = AppConfig.defaults.safeToSpendDays,
  onInfoPress,
}: SafeToSpendHeaderProps) => {
  const { theme } = useTheme();
  const strings = AppConfig.strings.dashboard;
  const formatSts = useStsMoneyFormat(loading);
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const amountFontSize = width < 360 ? Typography.sizes.jumbo : Typography.sizes.hero;

  const amountText = (
    <AppText
      testID="safe-to-spend-amount"
      variant="hero"
      fontRole="numeric"
      tabular
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.65}
      color={isOverCommitted ? 'error' : isPositiveSafeToSpend ? 'success' : undefined}
      weight="semibold"
      style={{
        fontSize: amountFontSize,
        lineHeight: Math.round(amountFontSize * Typography.lineHeights.tight),
      }}
    >
      {formatSts(amount, currencyCode)}
    </AppText>
  );

  return (
    <Column gap="none">
      <Row align="center" justify="space-between" gap="sm">
        <AppText
          variant="caption"
          weight="bold"
          color={isOverCommitted ? 'error' : 'secondary'}
          style={{ letterSpacing: 1.2, textTransform: 'uppercase', flex: 1 }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {isOverCommitted ? strings.shortfall : strings.safeToSpendTitle}
        </AppText>
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

      {!reduceMotion && !loading ? (
        <MotiView
          from={{ opacity: 0, scale: ChromeMotion.panelFromScale }}
          animate={{ opacity: 1, scale: 1 }}
          transition={ChromeMotion.sheetSpring}
        >
          {amountText}
        </MotiView>
      ) : (
        amountText
      )}

      <AppText variant="caption" color={isOverCommitted ? 'error' : 'secondary'} numberOfLines={3}>
        {isOverCommitted
          ? strings.shortfallSubtitle
          : forecastDays > 0
            ? strings.afterCommitmentsForDays(forecastDays)
            : strings.afterObligations}
      </AppText>
    </Column>
  );
};
