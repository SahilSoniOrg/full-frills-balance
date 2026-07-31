import { AppConfig } from '@/src/constants';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';

/**
 * Formats a Safe-to-Spend (or related) amount for display.
 * Masks when privacy mode is on; otherwise currency-formats with small-value handling.
 */
export function formatAmount(raw: number, currency: string, isPrivacyMode: boolean): string {
  if (isPrivacyMode) return AppConfig.privacyMask;

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

/** Loading placeholder used while STS data is not ready. */
export const FORMAT_AMOUNT_LOADING = '---';

/** Convenience: loading → placeholder, else formatAmount. */
export function formatAmountOrLoading(
  raw: number,
  currency: string,
  isPrivacyMode: boolean,
  isLoading: boolean,
): string {
  if (isLoading) return FORMAT_AMOUNT_LOADING;
  return formatAmount(raw, currency, isPrivacyMode);
}
