import type { PersonBalanceSummary, PersonCurrencyBalance } from '@/src/domain/people/personTypes';
import { filterActivePersonCurrencies } from './filterActivePersonCurrencies';

export type PersonHeroBalanceColor = 'income' | 'expense';

export type PersonHeroBalance = {
  primary: PersonCurrencyBalance | null;
  settled: boolean;
  oneSided: boolean;
  multiCurrency: boolean;
  balanceLabel: string;
  heroAmount: number;
  heroCurrency: string;
  heroColor: PersonHeroBalanceColor;
};

function resolvePrimary(summary: PersonBalanceSummary): PersonCurrencyBalance | null {
  const active = filterActivePersonCurrencies(summary.currencies);
  if (active.length === 1) return active[0]!;
  if (active.length === 0 && summary.convertedNet) {
    return {
      currencyCode: summary.convertedNet.currencyCode,
      owedToYou: 0,
      youOwe: 0,
      net: summary.convertedNet.amount,
    };
  }
  return null;
}

export function derivePersonHeroBalance(
  summary: PersonBalanceSummary,
  personName: string,
  fallbackCurrencyCode?: string | null,
): PersonHeroBalance {
  const active = filterActivePersonCurrencies(summary.currencies);
  const primary = resolvePrimary(summary);
  const settled =
    !primary || (primary.owedToYou === 0 && primary.youOwe === 0 && primary.net === 0);
  const oneSided =
    primary != null &&
    ((primary.owedToYou !== 0 && primary.youOwe === 0) ||
      (primary.youOwe !== 0 && primary.owedToYou === 0));
  const multiCurrency = active.length > 1;

  const balanceLabel = settled
    ? 'Balance'
    : oneSided && primary!.owedToYou !== 0
      ? `${personName} owes you`
      : oneSided && primary!.youOwe !== 0
        ? `You owe ${personName}`
        : 'Net';

  const heroAmount = settled ? 0 : oneSided ? primary!.owedToYou || primary!.youOwe : primary!.net;
  const heroCurrency =
    primary?.currencyCode ?? summary.convertedNet?.currencyCode ?? fallbackCurrencyCode ?? 'INR';
  const heroColor: PersonHeroBalanceColor = settled
    ? 'income'
    : oneSided
      ? primary!.owedToYou !== 0
        ? 'income'
        : 'expense'
      : heroAmount >= 0
        ? 'income'
        : 'expense';

  return {
    primary,
    settled,
    oneSided,
    multiCurrency,
    balanceLabel,
    heroAmount,
    heroCurrency,
    heroColor,
  };
}
