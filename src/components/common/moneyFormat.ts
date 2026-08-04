import { usePrivacyScope } from '@/src/contexts/PrivacyScope';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { useCallback } from 'react';

type UseMoneyFormatOptions = {
  short?: boolean;
};

/**
 * Privacy-aware number→string for surfaces that cannot host MoneyText
 * (e.g. SVG label concatenated with other text). Must run under PrivacyScopeProvider.
 */
export function useMoneyFormat(options: UseMoneyFormatOptions = {}) {
  const { short = false } = options;
  const { isPrivacyMode } = usePrivacyScope();

  return useCallback(
    (amount: number, currencyCode: string) =>
      short
        ? CurrencyFormatter.formatShortOrMask(amount, currencyCode, isPrivacyMode)
        : CurrencyFormatter.formatOrMask(amount, currencyCode, isPrivacyMode),
    [isPrivacyMode, short],
  );
}
