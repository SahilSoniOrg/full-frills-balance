import { AppText, type AppTextProps } from '@/src/components/core/AppText';
import { useMoneyFormat } from '@/src/components/common/moneyFormat';

type MoneyTextProps = Omit<AppTextProps, 'children'> & {
  amount: number;
  currencyCode: string;
  /** Short form (1.5K / 2.6L). Default is full currency format. */
  short?: boolean;
};

/**
 * Privacy-aware amount label (RN Text). Must render under PrivacyScopeProvider.
 * For SVG labels use SvgMoneyText; for string concat in SVG use useMoneyFormat.
 */
export function MoneyText({ amount, currencyCode, short = false, ...textProps }: MoneyTextProps) {
  const formatMoney = useMoneyFormat({ short });
  return <AppText {...textProps}>{formatMoney(amount, currencyCode)}</AppText>;
}
