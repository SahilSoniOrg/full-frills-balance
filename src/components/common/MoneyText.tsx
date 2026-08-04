import { AppText, type AppTextProps } from '@/src/components/core/AppText';
import { formatMoneyAmount, type MoneyFormatStyle } from '@/src/components/common/moneyFormat';
import { usePrivacyScope } from '@/src/contexts/PrivacyScope';

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
 * For SVG labels use useMoneyFormat with SvgText.
 */
export function MoneyText({
  amount,
  currencyCode,
  formatStyle,
  loading,
  prefix,
  ...textProps
}: MoneyTextProps) {
  const { isPrivacyMode } = usePrivacyScope();
  const text = formatMoneyAmount(amount, currencyCode, isPrivacyMode, {
    style: formatStyle,
    loading,
    prefix,
  });
  return <AppText {...textProps}>{text}</AppText>;
}
