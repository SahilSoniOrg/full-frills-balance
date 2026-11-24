import { normalizeCurrencyCode } from '@/src/domain/money/currencyPrecision';
import { Money } from '@/src/domain/money/money';
import type { MoneyAmount } from '@/src/types/domainReadModels';

export function sumByCurrency(amounts: Iterable<MoneyAmount>): MoneyAmount[] {
  const totals = new Map<string, Money>();
  for (const { amount, currencyCode } of amounts) {
    const code = normalizeCurrencyCode(currencyCode);
    if (!code) continue;

    const total = totals.get(code) ?? Money.from(0, code);
    totals.set(code, total.add(Money.from(amount, code)));
  }
  return [...totals.values()].map(({ amount, currencyCode }) => ({ amount, currencyCode }));
}
