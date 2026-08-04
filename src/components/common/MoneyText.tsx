import { AppText, type AppTextProps } from '@/src/components/core/AppText';
import { useMoneyFormat, type MoneyFormatStyle } from '@/src/components/common/moneyFormat';

type MoneyTextProps = Omit<AppTextProps, 'children'> & {
  amount: number;
  currencyCode: string;
  formatStyle?: MoneyFormatStyle;
  loading?: boolean;
};

/**
 * Privacy-aware amount label (RN Text). Must render under PrivacyScopeProvider.
 * For SVG labels use SvgMoneyText; for string concat in SVG use useMoneyFormat.
 */
export function MoneyText({
  amount,
  currencyCode,
  formatStyle,
  loading,
  ...textProps
}: MoneyTextProps) {
  const formatMoney = useMoneyFormat({ style: formatStyle, loading });
  return <AppText {...textProps}>{formatMoney(amount, currencyCode)}</AppText>;
}
