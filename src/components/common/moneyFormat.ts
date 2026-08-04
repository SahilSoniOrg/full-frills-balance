import { usePrivacyScope } from '@/src/contexts/PrivacyScope';
import { AppConfig } from '@/src/constants';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { useCallback } from 'react';

export const FORMAT_AMOUNT_LOADING = '---';

/** Display styles for money amounts. `sts` = Safe-to-Spend (<0.5 thresholds). */
export type MoneyFormatStyle = 'default' | 'short' | 'compact' | 'sts';

export type FormatMoneyOptions = {
  style?: MoneyFormatStyle;
  loading?: boolean;
  prefix?: string;
};

/**
 * Safe-to-spend amount formatting with small-value handling (< 0.5).
 * Prefer formatMoneyAmount / useMoneyFormat / useStsMoneyFormat so privacy is applied.
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

/** Privacy-aware number→string. Use when not under a React tree (tests, alerts). */
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

/**
 * Privacy-aware number→string for surfaces that cannot host MoneyText
 * (e.g. SVG label concatenated with other text). Must run under PrivacyScopeProvider.
 */
export function useMoneyFormat(options: FormatMoneyOptions = {}) {
  const { isPrivacyMode } = usePrivacyScope();
  const { style, loading, prefix } = options;

  return useCallback(
    (amount: number, currencyCode: string) =>
      formatMoneyAmount(amount, currencyCode, isPrivacyMode, { style, loading, prefix }),
    [isPrivacyMode, style, loading, prefix],
  );
}

/** STS display style under PrivacyScope (dense Safe-to-Spend surfaces). */
export function useStsMoneyFormat(loading = false) {
  return useMoneyFormat({ style: 'sts', loading });
}
