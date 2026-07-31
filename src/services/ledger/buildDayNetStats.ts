import { safeAdd } from '@/src/utils/money';

export type DayNetStats = {
  count: number;
  netAmount: number;
  currencyCode: string;
};

/**
 * Shared day-header net aggregation for transaction/journal lists.
 * Callers supply a signed amount already converted to `baseCurrency`
 * (positive = increase/income, negative = decrease/expense).
 */
export function buildDayNetStats<T>(
  items: T[],
  baseCurrency: string,
  precision: number,
  getSignedBaseAmount: (item: T) => number,
): DayNetStats {
  let netAmount = 0;
  for (const item of items) {
    const signed = getSignedBaseAmount(item);
    if (signed !== 0) {
      netAmount = safeAdd(netAmount, signed, precision);
    }
  }
  return {
    count: items.length,
    netAmount,
    currencyCode: baseCurrency,
  };
}

/** Convert a foreign amount to base using rateMap (amount / rate when rate > 0). */
export function amountInBaseCurrency(
  amount: number,
  currencyCode: string,
  baseCurrency: string,
  rateMap: Record<string, number>,
): number {
  if (currencyCode === baseCurrency) return amount;
  const rate = rateMap[currencyCode];
  if (rate && rate > 0) return amount / rate;
  return 0;
}
