import {
  type BudgetLineValuationAccount,
  type BudgetLineValuationTx,
  valueBudgetLinesForCurrency,
} from './budgetCalculationHelpers';
import { budgetUnvaluedJournalRows } from './budgetUnvaluedEntries';
import { buildBudgetCumulativeSeries } from '@/src/services/projections/buildBudgetCumulativeSeries';
import type {
  BudgetCumulativeSeries,
  BudgetCumulativeTx,
} from '@/src/services/projections/buildBudgetCumulativeSeries';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { safeAdd, safeSubtract } from '@/src/utils/money';

export interface BudgetCategorySpending {
  accountId: AccountId;
  spent: number;
  refunds: number;
  entryCount: number;
  hasUnvaluedEntries: boolean;
}

export interface BudgetCumulativeChart extends BudgetCumulativeSeries {
  hasUnvaluedEntries: boolean;
  unvaluedEntryCount?: number;
  unvaluedCurrencyCounts?: import('./budgetUnvaluedEntries').BudgetUnvaluedCurrencyCount[];
  categories: BudgetCategorySpending[];
  entryCount: number;
  refunds: number;
}

export interface BuildBudgetCumulativeChartInput {
  workplaceId: WorkplaceId;
  transactions: BudgetLineValuationTx[];
  accounts: BudgetLineValuationAccount[];
  targetCurrency: string;
  periodStart: number;
  periodEnd: number;
}

/** Convert each budget posting using its saved journal FX context, then build the chart. */
export async function buildBudgetCumulativeChart({
  workplaceId,
  transactions,
  accounts,
  targetCurrency,
  periodStart,
  periodEnd,
}: BuildBudgetCumulativeChartInput): Promise<BudgetCumulativeChart> {
  const accountById = new Map<AccountId, BudgetLineValuationAccount>(
    accounts.map(account => [account.id, account] as const),
  );
  const { lines, unvaluedEntries, journalById } = await valueBudgetLinesForCurrency(
    workplaceId,
    transactions,
    accountById,
    targetCurrency,
    'BudgetCumulativeChartService',
  );
  const chartTransactions: (BudgetCumulativeTx | null)[] = lines.map(line =>
    line
      ? {
          transactionDate: line.journalDate,
          amount: line.amount,
          transactionType: line.transactionType,
        }
      : null,
  );

  const series = buildBudgetCumulativeSeries({
    transactions: chartTransactions.filter((row): row is BudgetCumulativeTx => row !== null),
    periodStart,
    periodEnd,
    precision: getCurrencyPrecision(targetCurrency),
  });

  // Reuse the chart's historical valuation so breakdowns agree with its totals.
  const precision = getCurrencyPrecision(targetCurrency);
  const categories = new Map<AccountId, BudgetCategorySpending>();
  const entriesByAccount = new Map<AccountId, Set<JournalId>>();
  let refunds = 0;
  transactions.forEach((transaction, index) => {
    const category = categories.get(transaction.accountId) ?? {
      accountId: transaction.accountId,
      spent: 0,
      refunds: 0,
      entryCount: 0,
      hasUnvaluedEntries: false,
    };
    const entries = entriesByAccount.get(transaction.accountId) ?? new Set<JournalId>();
    entries.add(transaction.journalId);
    entriesByAccount.set(transaction.accountId, entries);
    category.entryCount = entries.size;
    category.hasUnvaluedEntries ||= unvaluedEntries[index];
    const valued = chartTransactions[index];
    if (valued && transaction.transactionType === 'DEBIT') {
      category.spent = safeAdd(category.spent, valued.amount, precision);
    } else if (valued && transaction.transactionType === 'CREDIT') {
      category.spent = safeSubtract(category.spent, valued.amount, precision);
      category.refunds = safeAdd(category.refunds, valued.amount, precision);
      refunds = safeAdd(refunds, valued.amount, precision);
    }
    categories.set(transaction.accountId, category);
  });

  return {
    ...series,
    hasUnvaluedEntries: unvaluedEntries.some(Boolean),
    ...budgetUnvaluedJournalRows(transactions, unvaluedEntries, accountById, journalById),
    categories: [...categories.values()].sort((a, b) => b.spent - a.spent),
    entryCount: new Set(transactions.map(transaction => transaction.journalId)).size,
    refunds,
  };
}
