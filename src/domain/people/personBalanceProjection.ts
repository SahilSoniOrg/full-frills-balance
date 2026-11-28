import {
  amountsAreEqual,
  safeAdd,
  safeSubtract,
  toMinorUnits,
  fromMinorUnits,
} from '@/src/domain/money/money';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import type { PersonId } from '@/src/types/ids';
import type {
  OpenItem,
  SettlementAllocation,
  AccountUnassignedState,
  PersonBalanceSummary,
  PersonLinkedAccount,
} from './personTypes';
export function openItemRemainder(
  item: OpenItem,
  allocations: readonly SettlementAllocation[],
  precision = getCurrencyPrecision(item.currencyCode),
): number {
  const p = precision;
  const active = allocations
    .filter(a => a.active && a.openItemId === item.id)
    .reduce((s, a) => safeAdd(s, a.amount, p), 0);
  return safeSubtract(item.originalAmount, active, p);
}
export function projectLinkedAccount(input: {
  accountId: OpenItem['accountId'];
  currencyCode: string;
  ledgerBalanceInNormalDirection: number;
  items: readonly OpenItem[];
  allocations: readonly SettlementAllocation[];
  precision?: number;
}): AccountUnassignedState {
  const p = input.precision ?? getCurrencyPrecision(input.currencyCode);
  const tracked = input.items
    .filter(i => i.accountId === input.accountId)
    .reduce((s, i) => safeAdd(s, openItemRemainder(i, input.allocations, p), p), 0);
  const unassigned = safeSubtract(input.ledgerBalanceInNormalDirection, tracked, p);
  return {
    accountId: input.accountId,
    currencyCode: input.currencyCode,
    ledgerBalanceInNormalDirection: input.ledgerBalanceInNormalDirection,
    trackedOpenRemainderSum: tracked,
    unassignedBalance: unassigned,
    hasNegativeUnassignedRemainder: unassigned < 0 && !amountsAreEqual(unassigned, 0, p),
  };
}
export function summarizePerson(input: {
  personId: PersonId;
  accounts: readonly PersonLinkedAccount[];
  items: readonly OpenItem[];
  allocations: readonly SettlementAllocation[];
  accountLedgerBalances?: ReadonlyMap<OpenItem['accountId'], number>;
  convertedCurrency?: string;
  quotes?: Readonly<Record<string, number>>;
  precisionByCurrency?: ReadonlyMap<string, number>;
}): PersonBalanceSummary {
  const precision = (currency: string) =>
    input.precisionByCurrency?.get(currency) ?? getCurrencyPrecision(currency);
  const map = new Map<string, { owedToYou: number; youOwe: number }>();
  if (input.accountLedgerBalances) {
    for (const acc of input.accounts) {
      if (acc.role !== 'receivable' && acc.role !== 'payable') continue;
      const balance = input.accountLedgerBalances.get(acc.accountId) ?? 0;
      const p = precision(acc.currencyCode);
      const b = map.get(acc.currencyCode) ?? { owedToYou: 0, youOwe: 0 };
      if (acc.role === 'receivable') {
        b.owedToYou = safeAdd(b.owedToYou, Math.max(0, balance), p);
      } else {
        b.youOwe = safeAdd(b.youOwe, Math.max(0, balance), p);
      }
      map.set(acc.currencyCode, b);
    }
  } else {
    for (const i of input.items) {
      const acc = input.accounts.find(a => a.accountId === i.accountId);
      if (!acc) continue;
      const p = precision(i.currencyCode);
      const v = openItemRemainder(i, input.allocations, p);
      const b = map.get(i.currencyCode) ?? { owedToYou: 0, youOwe: 0 };
      if (acc.role === 'receivable') b.owedToYou = safeAdd(b.owedToYou, v, p);
      if (acc.role === 'payable') b.youOwe = safeAdd(b.youOwe, v, p);
      map.set(i.currencyCode, b);
    }
  }
  const currencies = [...map].map(([currencyCode, b]) => ({
    currencyCode,
    ...b,
    net: safeSubtract(b.owedToYou, b.youOwe, precision(currencyCode)),
  }));
  if (!input.convertedCurrency) return { personId: input.personId, currencies };
  const missing: string[] = [];
  const p = precision(input.convertedCurrency);
  let netMinorUnits = 0;
  for (const c of currencies) {
    const q = input.quotes?.[c.currencyCode];
    if (c.currencyCode !== input.convertedCurrency && (!q || q <= 0)) {
      missing.push(c.currencyCode);
      continue;
    }
    netMinorUnits += toMinorUnits(c.net * (c.currencyCode === input.convertedCurrency ? 1 : q!), p);
  }
  return {
    personId: input.personId,
    currencies,
    convertedNet: {
      currencyCode: input.convertedCurrency,
      amount: fromMinorUnits(netMinorUnits, p),
      isInformational: true,
      missingCurrencies: missing,
    },
  };
}
