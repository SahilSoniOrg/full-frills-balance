import { Icon, IconButton, AppText } from '@/src/components/core';
import { AppConfig, ChromeMotion, Size, Typography } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { FitText } from '@/src/components/shared/FitText';
import { useStsMoneyFormat } from '@/src/components/shared/moneyFormat';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { MotiView } from 'moti';
import { useWindowDimensions } from 'react-native';
import type { SafeToSpendAmountTone } from '@/src/features/dashboard/safeToSpendNotices';

/** Smallest the hero amount shrinks to before it would rather stay legible. */
const HERO_MIN_FONT_SIZE = 36;

const AMOUNT_TONE_COLOR = {
  shortfall: 'error',
  uncertain: 'warning',
  incomplete: 'secondary',
  available: 'success',
  neutral: undefined,
} as const;

interface SafeToSpendHeaderProps {
  isOverCommitted: boolean;
  amount: number;
  /** Some balances could not be converted: show the amount as approximate, not as a verdict. */
  incomplete?: boolean;
  /** Hero color. Callers decide this once; the header does not learn each reason. */
  tone?: SafeToSpendAmountTone;
  currencyCode: string;
  loading?: boolean;
  infoDisabled?: boolean;
  forecastDays?: number;
  onInfoPress: () => void;
}

export const SafeToSpendHeader = ({
  isOverCommitted,
  amount,
  incomplete = false,
  tone = 'neutral',
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
    <FitText
      testID="safe-to-spend-amount"
      variant="hero"
      fontRole="numeric"
      tabular
      maxFontSize={amountFontSize}
      minFontSize={HERO_MIN_FONT_SIZE}
      lineHeightRatio={Typography.lineHeights.tight}
      color={AMOUNT_TONE_COLOR[tone]}
      weight="semibold"
    >
      {formatSts(amount, currencyCode, incomplete ? { prefix: '≈ ' } : undefined)}
    </FitText>
  );

  return (
    <Column gap="none">
      <Row align="center" justify="space-between" gap="sm">
        <AppText
          variant="overline"
          color={isOverCommitted ? 'error' : 'secondary'}
          style={{ flex: 1 }}
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

      {isOverCommitted ? (
        <AppText variant="body" weight="semibold" color="error">
          {strings.shortfallUnit}
        </AppText>
      ) : null}
      <AppText variant="caption" color="secondary" numberOfLines={isOverCommitted ? 1 : 3}>
        {isOverCommitted
          ? strings.shortfallSubtitle
          : forecastDays > 0
            ? strings.afterCommitmentsForDays(forecastDays)
            : strings.afterObligations}
      </AppText>
    </Column>
  );
};
