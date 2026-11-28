import type { PersonCurrencyBalance } from '@/src/domain/people/personTypes';

/** Currencies with a non-zero owed, you-owe, or net balance. */
export function filterActivePersonCurrencies(
  currencies: PersonCurrencyBalance[],
): PersonCurrencyBalance[] {
  return currencies.filter(
    balance => balance.owedToYou !== 0 || balance.youOwe !== 0 || balance.net !== 0,
  );
}
