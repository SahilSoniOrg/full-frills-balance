import { AppConfig } from '@/src/constants';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';

export const FORMAT_AMOUNT_LOADING = '---';

/** Display styles for money amounts. `sts` = Safe-to-Spend (<0.5 thresholds). */
export type MoneyFormatStyle = 'default' | 'short' | 'compact' | 'sts';

export type FormatMoneyOptions = {
  style?: MoneyFormatStyle;
  loading?: boolean;
  /** Sign chrome (+/-). Masked together with the amount in privacy mode. */
  prefix?: string;
};

/**
 * Safe-to-spend amount formatting with small-value handling (< 0.5).
 * Prefer formatMoneyAmount / useMoneyFormat so privacy is applied at the call site.
 */
export function formatStsAmount(raw: number, currency: string): string {
  const isVerySmall = Math.abs(raw) > 0 && Math.abs(raw) < 0.5;
  if (isVerySmall) {
    const oneFormatted = CurrencyFormatter.format(1, currency, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return raw > 0 ? `< ${oneFormatted}` : `> -${oneFormatted}`;
  }

  return CurrencyFormatter.format(raw, currency, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Privacy-aware number→string. Use from hooks, tests, and non-React surfaces (alerts). */
export function formatMoneyAmount(
  amount: number,
  currencyCode: string,
  isPrivacyMode: boolean,
  options: FormatMoneyOptions = {},
): string {
  const { loading = false, style = 'default', prefix = '' } = options;
  if (loading) return FORMAT_AMOUNT_LOADING;
  if (isPrivacyMode) return AppConfig.privacyMask;

  let formatted: string;
  switch (style) {
    case 'short':
      formatted = CurrencyFormatter.formatShort(amount, currencyCode);
      break;
    case 'compact':
      formatted = CurrencyFormatter.format(amount, currencyCode, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      break;
    case 'sts':
      formatted = formatStsAmount(amount, currencyCode);
      break;
    default:
      formatted = CurrencyFormatter.format(amount, currencyCode);
  }
  return prefix ? `${prefix}${formatted}` : formatted;
}
