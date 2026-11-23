import { DEFAULT_CURRENCY_PRECISION } from '@/src/domain/money/currencyPrecision';
import { roundToPrecision } from '@/src/domain/money/money';

import { AccountType, TransactionType } from '@/src/types/enums';

export type BalanceSign = -1 | 0 | 1;
export type FlowDirection = 'IN' | 'OUT';

/**
 * Signed balance effect of one (AccountType × TransactionType) pair.
 * Callers learn this object once instead of a flat helper barrel.
 */
export type BalanceEffect = {
  sign: BalanceSign;
  delta(amount: number): number;
  apply(current: number, amount: number, precision?: number): number;
  isIncrease: boolean;
  flow: FlowDirection;
  isLiquidInflow: boolean;
  isLiquidOutflow: boolean;
  netWorthDelta(amount: number): number;
};

export type FoldBalanceStep = {
  amount: number;
  accountType: AccountType;
  transactionType: TransactionType;
};

export function balanceSign(
  accountType: AccountType,
  transactionType: TransactionType,
): BalanceSign {
  switch (accountType) {
    case AccountType.ASSET:
    case AccountType.EXPENSE:
      return transactionType === TransactionType.DEBIT ? 1 : -1;
    case AccountType.LIABILITY:
    case AccountType.EQUITY:
    case AccountType.INCOME:
      return transactionType === TransactionType.CREDIT ? 1 : -1;
    default:
      return 0;
  }
}

/**
 * The signed effect of one (accountType × transactionType) pair.
 */
export function effect(accountType: AccountType, transactionType: TransactionType): BalanceEffect {
  const sign = balanceSign(accountType, transactionType);
  const isLiquidInflow =
    accountType === AccountType.ASSET && transactionType === TransactionType.DEBIT;
  const isLiquidOutflow =
    accountType === AccountType.ASSET && transactionType === TransactionType.CREDIT;

  return {
    sign,
    isIncrease: sign > 0,
    flow: transactionType === TransactionType.DEBIT ? 'IN' : 'OUT',
    isLiquidInflow,
    isLiquidOutflow,
    delta(amount: number) {
      return amount * sign;
    },
    apply(current: number, amount: number, precision = DEFAULT_CURRENCY_PRECISION) {
      return roundToPrecision(current + amount * sign, precision);
    },
    netWorthDelta(amount: number) {
      const balanceImpact = amount * sign;
      return accountType === AccountType.LIABILITY ||
        accountType === AccountType.EQUITY ||
        accountType === AccountType.EXPENSE
        ? -balanceImpact
        : balanceImpact;
    },
  };
}

/**
 * Apply effects over an ordered sequence (rebuild / import).
 * Inactive/deleted filtering is the caller's job.
 */
export function foldBalances(
  seed: number,
  steps: readonly FoldBalanceStep[],
  precision: number = DEFAULT_CURRENCY_PRECISION,
): { balances: number[]; final: number } {
  const balances: number[] = [];
  let current = seed;
  for (const step of steps) {
    current = effect(step.accountType, step.transactionType).apply(current, step.amount, precision);
    balances.push(current);
  }
  return { balances, final: current };
}
