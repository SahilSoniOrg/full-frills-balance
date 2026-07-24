/**
 * Accounting aggregates and compatibility wrappers over BalanceEffects.
 * Prefer `effect` / `checkJournal` / `foldBalances` from BalanceEffects for new code.
 */
import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import {
  checkJournal,
  effect,
  periodFlowSQL,
  type JournalLineForCheck,
} from '@/src/services/accounting/BalanceEffects';
import { toAccountType } from '@/src/utils/accountCategory';
import { roundToPrecision } from '@/src/utils/money';

export type { JournalLineForCheck as JournalLineInput };

export function getBalanceImpactMultiplier(
  accountType: AccountType,
  transactionType: TransactionType,
): number {
  return effect(accountType, transactionType).sign;
}

export function getAccountBalanceDelta(
  amount: number,
  accountType: AccountType,
  transactionType: TransactionType,
): number {
  return effect(accountType, transactionType).delta(amount);
}

export function isLiquidInflow(
  accountType: AccountType,
  transactionType: TransactionType,
): boolean {
  return effect(accountType, transactionType).isLiquidInflow;
}

export function isLiquidOutflow(
  accountType: AccountType,
  transactionType: TransactionType,
): boolean {
  return effect(accountType, transactionType).isLiquidOutflow;
}

export function getLiquidNetWorthDelta(
  amount: number,
  accountType: AccountType,
  transactionType: TransactionType,
): number {
  return effect(accountType, transactionType).netWorthDelta(amount);
}

export function isBalanceIncrease(
  accountType: AccountType,
  transactionType: TransactionType,
): boolean {
  return effect(accountType, transactionType).isIncrease;
}

export function isValueEntering(transactionType: TransactionType): boolean {
  return transactionType === TransactionType.DEBIT;
}

export function isValueLeaving(transactionType: TransactionType): boolean {
  return transactionType === TransactionType.CREDIT;
}

export const isIncrease = isBalanceIncrease;

export function getPeriodIncreaseSQLSnippet(): string {
  return periodFlowSQL().increaseCase;
}

export function getPeriodDecreaseSQLSnippet(): string {
  return periodFlowSQL().decreaseCase;
}

export function validateBalance(
  lines: JournalLineForCheck[],
  precision: number = AppConfig.constants.precision,
) {
  return checkJournal(lines, precision);
}

export interface AccountPeriodFlows {
  totalIncrease: number;
  totalDecrease: number;
  netFlow: number;
}

export function calculateAccountPeriodFlows(
  accountType: string | AccountType,
  transactions: { amount: number; transactionType: TransactionType }[],
  precision: number = AppConfig.constants.precision,
): AccountPeriodFlows {
  const type = toAccountType(accountType) || (accountType as AccountType);
  let totalIncrease = 0;
  let totalDecrease = 0;

  for (const tx of transactions) {
    if (isBalanceIncrease(type, tx.transactionType)) {
      totalIncrease += tx.amount;
    } else {
      totalDecrease += tx.amount;
    }
  }

  const roundedIncrease = roundToPrecision(totalIncrease, precision);
  const roundedDecrease = roundToPrecision(totalDecrease, precision);
  const netFlow = roundToPrecision(roundedIncrease - roundedDecrease, precision);

  return {
    totalIncrease: roundedIncrease,
    totalDecrease: roundedDecrease,
    netFlow,
  };
}

export interface IncomeVsExpenseSummary {
  income: number;
  expense: number;
  netSavings: number;
  savingsRate: number;
}

export function calculateIncomeVsExpenseSummary(
  deltas: { accountType: string | AccountType; amount: number }[],
  precision: number = AppConfig.constants.precision,
): IncomeVsExpenseSummary {
  let income = 0;
  let expense = 0;

  for (const item of deltas) {
    const type = toAccountType(item.accountType);
    if (type === AccountType.INCOME) {
      income += item.amount;
    } else if (type === AccountType.EXPENSE) {
      expense += item.amount;
    }
  }

  const roundedIncome = roundToPrecision(income, precision);
  const roundedExpense = roundToPrecision(expense, precision);
  const netSavings = roundToPrecision(roundedIncome - roundedExpense, precision);
  const savingsRate =
    roundedIncome > 0 ? roundToPrecision((netSavings / roundedIncome) * 100, 2) : 0;

  return {
    income: roundedIncome,
    expense: roundedExpense,
    netSavings,
    savingsRate,
  };
}

export interface CategoryBreakdownItem {
  category: string;
  amount: number;
  percentage: number;
}

export function calculateCategoryBreakdownItems(
  items: { category: string; amount: number }[],
  precision: number = AppConfig.constants.precision,
): CategoryBreakdownItem[] {
  const aggregatedMap = new Map<string, number>();
  let grandTotal = 0;

  for (const item of items) {
    const current = aggregatedMap.get(item.category) || 0;
    aggregatedMap.set(item.category, current + item.amount);
  }

  for (const amount of aggregatedMap.values()) {
    if (amount > 0) {
      grandTotal += amount;
    }
  }

  return Array.from(aggregatedMap.entries())
    .filter(([_, amount]) => amount > 0)
    .map(([category, amount]) => {
      const roundedAmount = roundToPrecision(amount, precision);
      const percentage = grandTotal > 0 ? roundToPrecision((amount / grandTotal) * 100, 2) : 0;
      return {
        category,
        amount: roundedAmount,
        percentage,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}
