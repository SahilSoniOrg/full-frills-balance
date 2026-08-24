import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
/**
 * Accounting aggregates that are not mere BalanceEffects wrappers.
 * Prefer `effect` / `checkJournal` / `foldBalances` / `periodFlowSQL` from BalanceEffects for signs.
 */
import { AppConfig } from '@/src/constants/app-config';

import { effect } from '@/src/utils/accounting/BalanceEffects';
import type { CategoryBreakdown } from '@/src/services/reports/reportSnapshot';
import { toAccountType } from '@/src/utils/accountCategory';
import { roundToPrecision } from '@/src/utils/money';

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
    if (effect(type, tx.transactionType).isIncrease) {
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

export function calculateCategoryBreakdownItems(
  items: { category: string; amount: number; accountId?: AccountId }[],
  precision: number = AppConfig.constants.precision,
): CategoryBreakdown[] {
  const aggregatedMap = new Map<string, { amount: number; accountIds: Set<AccountId> }>();
  let grandTotal = 0;

  for (const item of items) {
    const current = aggregatedMap.get(item.category) ?? {
      amount: 0,
      accountIds: new Set<AccountId>(),
    };
    current.amount += item.amount;
    if (item.accountId) {
      current.accountIds.add(item.accountId);
    }
    aggregatedMap.set(item.category, current);
  }

  for (const { amount } of aggregatedMap.values()) {
    if (amount > 0) {
      grandTotal += amount;
    }
  }

  return Array.from(aggregatedMap.entries())
    .filter(([_, { amount }]) => amount > 0)
    .map(([category, { amount, accountIds }]) => {
      const roundedAmount = roundToPrecision(amount, precision);
      const percentage = grandTotal > 0 ? roundToPrecision((amount / grandTotal) * 100, 2) : 0;
      return {
        category,
        amount: roundedAmount,
        percentage,
        accountIds: Array.from(accountIds),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}
