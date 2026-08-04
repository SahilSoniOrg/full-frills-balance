import { useMoneyFormat, type MoneyFormatStyle } from '@/src/components/common/moneyFormat';
import { Text as SvgText, type TextProps as SvgTextProps } from 'react-native-svg';

type SvgMoneyTextProps = Omit<SvgTextProps, 'children'> & {
  amount: number;
  currencyCode: string;
  formatStyle?: MoneyFormatStyle;
  /** Short form (1.5K / 2.6L). Alias for `formatStyle: 'short'`. */
  short?: boolean;
  loading?: boolean;
};

/**
 * Privacy-aware amount label for react-native-svg Text.
 * Must render under PrivacyScopeProvider.
 */
export function SvgMoneyText({
  amount,
  currencyCode,
  formatStyle,
  short = false,
  loading,
  ...textProps
}: SvgMoneyTextProps) {
  const formatMoney = useMoneyFormat({ style: formatStyle, short, loading });
  return <SvgText {...textProps}>{formatMoney(amount, currencyCode)}</SvgText>;
}
