import { AppConfig } from '@/src/constants/app-config';
import type { BatchImportData, CanonicalTransaction } from '@/src/types/importContracts';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';

function hasValidRate(rate: number | undefined): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
}

function transactionDate(
  transaction: CanonicalTransaction,
  journalDates: Map<string, number>,
): number {
  return journalDates.get(transaction.journalId) ?? transaction.transactionDate;
}

function formatTransactionDate(date: number): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? 'invalid date' : parsed.toISOString().slice(0, 10);
}

export async function backfillHistoricalExchangeRates(
  data: BatchImportData,
  defaultCurrency: string,
): Promise<{ data: BatchImportData; warnings: string[] }> {
  const targetCurrency = defaultCurrency.trim().toUpperCase();
  const journalDates = new Map(data.journals.map(journal => [journal.id, journal.journalDate]));

  type BackfillResult = { transaction: CanonicalTransaction; warning?: string };
  const results: BackfillResult[] = new Array(data.transactions.length);

  await runTasksWithBoundedConcurrency(
    data.transactions,
    AppConfig.performance.maxConcurrentOperations,
    async (transaction, index) => {
      if (hasValidRate(transaction.exchangeRate)) {
        results[index] = { transaction };
        return;
      }

      const fromCurrency = transaction.currencyCode.trim().toUpperCase();
      if (!fromCurrency || fromCurrency === targetCurrency) {
        results[index] = { transaction };
        return;
      }

      const date = transactionDate(transaction, journalDates);
      try {
        const quote = await exchangeRateService.getHistoricalRate(
          fromCurrency,
          targetCurrency,
          date,
        );
        results[index] = { transaction: { ...transaction, exchangeRate: quote.rate } };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        results[index] = {
          transaction,
          warning: `Historical exchange rate unavailable for transaction ${transaction.id} (${fromCurrency} -> ${targetCurrency} on ${formatTransactionDate(date)}): ${reason}`,
        };
      }
    },
  );

  return {
    data: { ...data, transactions: results.map(result => result.transaction) },
    warnings: results.flatMap(result => (result.warning ? [result.warning] : [])),
  };
}
