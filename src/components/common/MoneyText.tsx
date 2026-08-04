import { AppText, type AppTextProps } from '@/src/components/core/AppText';
import { usePrivacyScope } from '@/src/contexts/PrivacyScope';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';

type MoneyTextProps = Omit<AppTextProps, 'children'> & {
  amount: number;
  currencyCode: string;
  /** Short form (1.5K / 2.6L). Default is full currency format. */
  short?: boolean;
};

/**
 * Privacy-aware amount label. Must render under PrivacyScopeProvider.
 * Charts (SVG) cannot use this — pass formatValue instead.
 */
export function MoneyText({ amount, currencyCode, short = false, ...textProps }: MoneyTextProps) {
  const { isPrivacyMode } = usePrivacyScope();
  const text = short
    ? CurrencyFormatter.formatShortOrMask(amount, currencyCode, isPrivacyMode)
    : CurrencyFormatter.formatOrMask(amount, currencyCode, isPrivacyMode);

  return <AppText {...textProps}>{text}</AppText>;
}
