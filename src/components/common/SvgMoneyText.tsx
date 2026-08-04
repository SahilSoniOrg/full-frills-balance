import { useMoneyFormat } from '@/src/components/common/moneyFormat';
import { Text as SvgText, type TextProps as SvgTextProps } from 'react-native-svg';

type SvgMoneyTextProps = Omit<SvgTextProps, 'children'> & {
  amount: number;
  currencyCode: string;
  /** Short form (1.5K / 2.6L). Default is full currency format. */
  short?: boolean;
};

/**
 * Privacy-aware amount label for react-native-svg Text.
 * Must render under PrivacyScopeProvider.
 */
export function SvgMoneyText({
  amount,
  currencyCode,
  short = false,
  ...textProps
}: SvgMoneyTextProps) {
  const formatMoney = useMoneyFormat({ short });
  return <SvgText {...textProps}>{formatMoney(amount, currencyCode)}</SvgText>;
}
