import { usePrivacyScope } from '@/src/contexts/PrivacyScope';
import { formatMoneyAmount, type FormatMoneyOptions } from '@/src/utils/moneyFormat';
import { useCallback } from 'react';

export type MoneyFormatFn = (
  amount: number,
  currencyCode: string,
  overrides?: Pick<FormatMoneyOptions, 'prefix' | 'loading'>,
) => string;

/**
 * Privacy-aware number→string for surfaces that cannot host MoneyText
 * (SVG labels, design-system Text, string embeds). Must run under PrivacyScopeProvider.
 *
 * Prefer MoneyText for AppText amount labels.
 * SVG / string concat: use this hook (optionally pass per-call `prefix`).
 */
export function useMoneyFormat(options: FormatMoneyOptions = {}): MoneyFormatFn {
  const { isPrivacyMode } = usePrivacyScope();
  const { style, loading, prefix } = options;

  return useCallback(
    (amount, currencyCode, overrides) =>
      formatMoneyAmount(amount, currencyCode, isPrivacyMode, {
        style,
        loading: overrides?.loading ?? loading,
        prefix: overrides?.prefix ?? prefix,
      }),
    [isPrivacyMode, style, loading, prefix],
  );
}

/** STS display style under PrivacyScope (dense Safe-to-Spend surfaces). */
export function useStsMoneyFormat(loading = false): MoneyFormatFn {
  return useMoneyFormat({ style: 'sts', loading });
}
