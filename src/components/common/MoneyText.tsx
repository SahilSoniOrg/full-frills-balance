import { AppText, type AppTextProps } from '@/src/components/core/AppText';
import { useMoneyFormat, type MoneyFormatStyle } from '@/src/components/common/moneyFormat';

type MoneyTextProps = Omit<AppTextProps, 'children'> & {
  amount: number;
  currencyCode: string;
  formatStyle?: MoneyFormatStyle;
  loading?: boolean;
  /** Sign prefix (+/-/etc). Masked together with the amount in privacy mode. */
  prefix?: string;
};

/**
 * Privacy-aware amount label (RN Text). Must render under PrivacyScopeProvider.
 * For SVG / string embeds use useMoneyFormat (with optional per-call prefix).
 */
export function MoneyText({
  amount,
  currencyCode,
  formatStyle,
  loading,
  prefix,
  ...textProps
}: MoneyTextProps) {
  const formatMoney = useMoneyFormat({ style: formatStyle, loading, prefix });
  return <AppText {...textProps}>{formatMoney(amount, currencyCode)}</AppText>;
}
