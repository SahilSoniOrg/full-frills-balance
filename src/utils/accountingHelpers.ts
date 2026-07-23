import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { roundToPrecision } from '@/src/utils/money';

/**
 * Validatable transaction partial
 */
export interface JournalLineInput {
  amount: number;
  type: TransactionType;
  exchangeRate?: number;
}

/**
 * Determines if a specific transaction (Debit or Credit) increases or decreases
 * an account's balance based on its type.
 */
export function getBalanceImpactMultiplier(
  accountType: AccountType,
  transactionType: TransactionType,
): number {
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
 * Returns the signed change to an account's balance.
 * (e.g. Asset Debit = +amount, Asset Credit = -amount, Liability Credit = +amount)
 */
export function getAccountBalanceDelta(
  amount: number,
  accountType: AccountType,
  transactionType: TransactionType,
): number {
  return amount * getBalanceImpactMultiplier(accountType, transactionType);
}

/**
 * Returns true if this impact represents a physical "flow" into or out of
 * a liquid account (Asset).
 */
export function isLiquidInflow(
  accountType: AccountType,
  transactionType: TransactionType,
): boolean {
  return accountType === AccountType.ASSET && transactionType === TransactionType.DEBIT;
}

export function isLiquidOutflow(
  accountType: AccountType,
  transactionType: TransactionType,
): boolean {
  return accountType === AccountType.ASSET && transactionType === TransactionType.CREDIT;
}

/**
 * Returns the impact of a transaction on the "Liquid Net Worth" (Assets - Liabilities).
 * This is used for simulation and consolidated wealth views.
 *
 * Net Worth perspective (+ means wealth increases):
 * - Asset Increase: +
 * - Liability Increase: -
 */
export function getLiquidNetWorthDelta(
  amount: number,
  accountType: AccountType,
  transactionType: TransactionType,
): number {
  const balanceImpact = getAccountBalanceDelta(amount, accountType, transactionType);
  // Assets and Income: Balance Increase = Wealth Increase
  // Liabilities, Equity, and Expenses: Balance Increase = Wealth Decrease
  return accountType === AccountType.LIABILITY ||
    accountType === AccountType.EQUITY ||
    accountType === AccountType.EXPENSE
    ? -balanceImpact
    : balanceImpact;
}

/**
 * Determines if a change is an "increase" in the account's balance.
 * (e.g. Asset Debit is an increase, Liability Credit is an increase)
 */
export function isBalanceIncrease(
  accountType: AccountType,
  transactionType: TransactionType,
): boolean {
  return getBalanceImpactMultiplier(accountType, transactionType) > 0;
}

/**
 * Determines if a transaction represents value ENTERING an account (Destination).
 * This follows the "Value Flow" model where DEBIT = IN and CREDIT = OUT.
 */
export function isValueEntering(transactionType: TransactionType): boolean {
  return transactionType === TransactionType.DEBIT;
}

/**
 * Determines if a transaction represents value LEAVING an account (Source).
 */
export function isValueLeaving(transactionType: TransactionType): boolean {
  return transactionType === TransactionType.CREDIT;
}

// Deprecated: Use isBalanceIncrease for clarity
export const isIncrease = isBalanceIncrease;

/**
 * Returns the SQL snippet for calculating the account balance delta (period increase/decrease).
 * This unifies JS and SQL business logic.
 */
export function getPeriodIncreaseSQLSnippet(): string {
  // Returns gross balance increases (positive deltas)
  return `
    CASE 
      WHEN (a.account_type = '${AccountType.INCOME}' AND t.transaction_type = '${TransactionType.CREDIT}') THEN t.amount
      WHEN (a.account_type = '${AccountType.EXPENSE}' AND t.transaction_type = '${TransactionType.DEBIT}') THEN t.amount
      WHEN (a.account_type = '${AccountType.ASSET}' AND t.transaction_type = '${TransactionType.DEBIT}') THEN t.amount
      WHEN (a.account_type IN ('${AccountType.LIABILITY}', '${AccountType.EQUITY}') AND t.transaction_type = '${TransactionType.CREDIT}') THEN t.amount
      ELSE 0 
    END
  `.trim();
}

export function getPeriodDecreaseSQLSnippet(): string {
  // Returns gross balance decreases (positive deltas)
  return `
    CASE 
      WHEN (a.account_type = '${AccountType.INCOME}' AND t.transaction_type = '${TransactionType.DEBIT}') THEN t.amount
      WHEN (a.account_type = '${AccountType.EXPENSE}' AND t.transaction_type = '${TransactionType.CREDIT}') THEN t.amount
      WHEN (a.account_type = '${AccountType.ASSET}' AND t.transaction_type = '${TransactionType.CREDIT}') THEN t.amount
      WHEN (a.account_type IN ('${AccountType.LIABILITY}', '${AccountType.EQUITY}') AND t.transaction_type = '${TransactionType.DEBIT}') THEN t.amount
      ELSE 0 
    END
  `.trim();
}

/**
 * Validates if a set of journal lines are balanced.
 * @param lines Journal lines to validate
 * @param precision Precision of the journal currency (default 2)
 */
export function validateBalance(
  lines: JournalLineInput[],
  precision: number = AppConfig.constants.precision,
): {
  isValid: boolean;
  imbalance: number;
  totalDebits: number;
  totalCredits: number;
} {
  const totalDebits = lines
    .filter(l => l.type === TransactionType.DEBIT)
    .reduce((sum, l) => sum + l.amount * (l.exchangeRate || 1), 0);

  const totalCredits = lines
    .filter(l => l.type === TransactionType.CREDIT)
    .reduce((sum, l) => sum + l.amount * (l.exchangeRate || 1), 0);

  const imbalance = roundToPrecision(totalDebits - totalCredits, precision);

  return {
    isValid: Math.abs(imbalance) < Math.pow(10, -(precision + 1)), // Use precision-aware epsilon
    imbalance,
    totalDebits: roundToPrecision(totalDebits, precision),
    totalCredits: roundToPrecision(totalCredits, precision),
  };
}

/**
 * Calculates gross period flows (increase, decrease, net flow) for an account.
 */
export interface AccountPeriodFlows {
  totalIncrease: number;
  totalDecrease: number;
  netFlow: number;
}

export function calculateAccountPeriodFlows(
  accountType: AccountType,
  transactions: { amount: number; transactionType: TransactionType }[],
  precision: number = AppConfig.constants.precision,
): AccountPeriodFlows {
  let totalIncrease = 0;
  let totalDecrease = 0;

  for (const tx of transactions) {
    if (isBalanceIncrease(accountType, tx.transactionType)) {
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

/**
 * Calculates income vs expense summary, net savings, and savings rate.
 */
export interface IncomeVsExpenseSummary {
  income: number;
  expense: number;
  netSavings: number;
  savingsRate: number;
}

export function calculateIncomeVsExpenseSummary(
  deltas: { accountType: AccountType; amount: number }[],
  precision: number = AppConfig.constants.precision,
): IncomeVsExpenseSummary {
  let income = 0;
  let expense = 0;

  for (const item of deltas) {
    if (item.accountType === AccountType.INCOME) {
      income += item.amount;
    } else if (item.accountType === AccountType.EXPENSE) {
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

/**
 * Aggregates category items into sorted category breakdown items with percentage metrics.
 */
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
    if (item.amount <= 0) continue;
    const current = aggregatedMap.get(item.category) || 0;
    const updated = current + item.amount;
    aggregatedMap.set(item.category, updated);
    grandTotal += item.amount;
  }

  if (grandTotal <= 0) return [];

  return Array.from(aggregatedMap.entries())
    .map(([category, amount]) => {
      const roundedAmount = roundToPrecision(amount, precision);
      const percentage = roundToPrecision((amount / grandTotal) * 100, 2);
      return {
        category,
        amount: roundedAmount,
        percentage,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}
