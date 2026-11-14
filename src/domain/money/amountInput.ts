import { DEFAULT_CURRENCY_PRECISION } from '@/src/domain/money/currencyPrecision';
import { roundToPrecision } from './moneyRounding';

/** Returns true when pasted amount text contains a Unicode or ASCII minus sign. */
export function hasNegativeAmountSign(amount: string): boolean {
  return /[-−﹣－]/.test(amount);
}

export const sanitizeAmount = (
  amount: string | number,
  precision = DEFAULT_CURRENCY_PRECISION,
): number | null => {
  const numAmount =
    typeof amount === 'string' ? Number.parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;

  if (!Number.isFinite(numAmount)) {
    return null;
  }

  return roundToPrecision(numAmount, precision);
};
