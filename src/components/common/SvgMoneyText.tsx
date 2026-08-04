import { useMoneyFormat, type MoneyFormatStyle } from '@/src/components/common/moneyFormat';
import { Text as SvgText, type TextProps as SvgTextProps } from 'react-native-svg';

type SvgMoneyTextProps = Omit<SvgTextProps, 'children'> & {
  amount: number;
  currencyCode: string;
  formatStyle?: MoneyFormatStyle;
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
  loading,
  ...textProps
}: SvgMoneyTextProps) {
  const formatMoney = useMoneyFormat({ style: formatStyle, loading });
  return <SvgText {...textProps}>{formatMoney(amount, currencyCode)}</SvgText>;
}
