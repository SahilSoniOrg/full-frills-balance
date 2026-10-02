import type Journal from '@/src/data/models/Journal';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { AppConfig } from '@/src/constants/app-config';
import { convertJournalLineAmount } from '@/src/services/currencyConversion';
import { buildBudgetCumulativeSeries } from '@/src/services/projections/buildBudgetCumulativeSeries';
import type {
  BudgetCumulativeSeries,
  BudgetCumulativeTx,
} from '@/src/services/projections/buildBudgetCumulativeSeries';
import type { TransactionType } from '@/src/types/enums';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';
import { logger } from '@/src/utils/logger';
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
  categories: BudgetCategorySpending[];
  entryCount: number;
  refunds: number;
}

/** Chart account fields — models or plain DTOs. */
export type BudgetChartAccountInput = {
  id: AccountId;
  currencyCode?: string;
};

/** Chart transaction fields — models or plain DTOs. */
export type BudgetChartTransactionInput = {
  id: string;
  journalId: JournalId;
  accountId: AccountId;
  amount: number;
  currencyCode?: string;
  exchangeRate?: number;
  transactionType: TransactionType;
};

export interface BuildBudgetCumulativeChartInput {
  workplaceId: WorkplaceId;
  transactions: BudgetChartTransactionInput[];
  accounts: BudgetChartAccountInput[];
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
  const journals = await journalQueryRepository.findByIds(workplaceId, [
    ...new Set(transactions.map(transaction => transaction.journalId)),
  ]);
  const journalById = new Map<string, Journal>(
    journals.map(journal => [journal.id, journal] as const),
  );
  const accountById = new Map<AccountId, BudgetChartAccountInput>(
    accounts.map(account => [account.id, account] as const),
  );
  const chartTransactions: (BudgetCumulativeTx | null)[] = new Array(transactions.length).fill(
    null,
  );
  const unvaluedEntries = new Array<boolean>(transactions.length).fill(false);

  await runTasksWithBoundedConcurrency(
    transactions,
    AppConfig.performance.maxConcurrentOperations,
    async (transaction, index) => {
      const journal = journalById.get(transaction.journalId);
      const account = accountById.get(transaction.accountId);
      if (!journal || !account) {
        unvaluedEntries[index] = true;
        return;
      }

      const converted = await convertJournalLineAmount({
        amount: transaction.amount,
        lineCurrency: transaction.currencyCode || account.currencyCode || journal.currencyCode,
        journalCurrency: journal.currencyCode,
        targetCurrency,
        storedLineRate: transaction.exchangeRate,
        journalDate: journal.journalDate,
      });
      if (!converted.ok) {
        unvaluedEntries[index] = true;
        logger.warn('[BudgetCumulativeChartService] Skipping unvalued budget chart line', {
          transactionId: transaction.id,
          from: converted.missingRate.fromCurrency,
          to: converted.missingRate.toCurrency,
          journalDate: journal.journalDate,
        });
        return;
      }

      chartTransactions[index] = {
        transactionDate: journal.journalDate,
        amount: converted.amount,
        transactionType: transaction.transactionType,
      };
    },
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
    categories: [...categories.values()].sort((a, b) => b.spent - a.spent),
    entryCount: new Set(transactions.map(transaction => transaction.journalId)).size,
    refunds,
  };
}
