import { AppConfig } from '@/src/constants/app-config';
import { AccountType, TransactionType } from '@/src/types/domain';

import { roundToPrecision } from '@/src/utils/money';

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

export type JournalLineForCheck = {
  amount: number;
  type: TransactionType;
  exchangeRate?: number;
};

export type JournalCheckResult = {
  isValid: boolean;
  imbalance: number;
  totalDebits: number;
  totalCredits: number;
};

export type FoldBalanceStep = {
  amount: number;
  accountType: AccountType;
  transactionType: TransactionType;
};

function signFor(accountType: AccountType, transactionType: TransactionType): BalanceSign {
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

function buildSignCase(sign: BalanceSign): string {
  const clauses = Object.values(AccountType).flatMap(accountType =>
    Object.values(TransactionType)
      .filter(transactionType => signFor(accountType, transactionType) === sign)
      .map(
        transactionType =>
          `WHEN (a.account_type = '${accountType}' AND t.transaction_type = '${transactionType}') THEN t.amount`,
      ),
  );

  return `CASE\n      ${clauses.join('\n      ')}\n      ELSE 0\n    END`;
}

/**
 * The signed effect of one (accountType × transactionType) pair.
 */
export function effect(accountType: AccountType, transactionType: TransactionType): BalanceEffect {
  const sign = signFor(accountType, transactionType);
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
    apply(current: number, amount: number, precision = AppConfig.constants.precision) {
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
  precision: number = AppConfig.constants.precision,
): { balances: number[]; final: number } {
  const balances: number[] = [];
  let current = seed;
  for (const step of steps) {
    current = effect(step.accountType, step.transactionType).apply(current, step.amount, precision);
    balances.push(current);
  }
  return { balances, final: current };
}

/**
 * Debits ≡ credits (with FX × precision).
 * Does not validate distinct accounts, line count, or zero amounts.
 */
export function checkJournal(
  lines: readonly JournalLineForCheck[],
  precision: number = AppConfig.constants.precision,
): JournalCheckResult {
  const totalDebits = lines
    .filter(l => l.type === TransactionType.DEBIT)
    .reduce((sum, l) => sum + l.amount * (l.exchangeRate || 1), 0);

  const totalCredits = lines
    .filter(l => l.type === TransactionType.CREDIT)
    .reduce((sum, l) => sum + l.amount * (l.exchangeRate || 1), 0);

  const imbalance = roundToPrecision(totalDebits - totalCredits, precision);

  return {
    isValid: Math.abs(imbalance) < Math.pow(10, -(precision + 1)),
    imbalance,
    totalDebits: roundToPrecision(totalDebits, precision),
    totalCredits: roundToPrecision(totalCredits, precision),
  };
}

/**
 * SQL CASE fragments derived from the same sign table as `effect`.
 */
export function periodFlowSQL(): { increaseCase: string; decreaseCase: string } {
  return {
    increaseCase: buildSignCase(1),
    decreaseCase: buildSignCase(-1),
  };
}
