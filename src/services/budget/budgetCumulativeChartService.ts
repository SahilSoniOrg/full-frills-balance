import type Account from '@/src/data/models/Account';
import type Journal from '@/src/data/models/Journal';
import type Transaction from '@/src/data/models/Transaction';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { AppConfig } from '@/src/constants/app-config';
import { convertJournalLineAmount } from '@/src/services/currencyConversion';
import { buildBudgetCumulativeSeries } from '@/src/services/projections/buildBudgetCumulativeSeries';
import type {
  BudgetCumulativeSeries,
  BudgetCumulativeTx,
} from '@/src/services/projections/buildBudgetCumulativeSeries';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';
import { logger } from '@/src/utils/logger';

export interface BudgetCumulativeChart extends BudgetCumulativeSeries {
  hasUnvaluedEntries: boolean;
}

export interface BuildBudgetCumulativeChartInput {
  workplaceId: WorkplaceId;
  transactions: Transaction[];
  accounts: Account[];
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
  const accountById = new Map<AccountId, Account>(
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

  return {
    ...series,
    hasUnvaluedEntries: unvaluedEntries.some(Boolean),
  };
}
