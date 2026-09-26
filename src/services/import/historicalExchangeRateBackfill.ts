import { AppConfig } from '@/src/constants/app-config';
import type { BatchImportData, CanonicalTransaction } from '@/src/types/importContracts';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';
import {
  getJournalFxDateKey,
  getJournalHistoricalFxTimestamp,
} from '@/src/domain/accounting/journalFx';

function hasValidRate(rate: number | undefined): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
}

export async function backfillHistoricalExchangeRates(
  data: BatchImportData,
  preserveTransactionIds: ReadonlySet<string> = new Set(),
): Promise<{ data: BatchImportData; warnings: string[] }> {
  const journalById = new Map(data.journals.map(journal => [journal.id, journal]));

  type BackfillResult = { transaction: CanonicalTransaction; warning?: string };
  const results: BackfillResult[] = new Array(data.transactions.length);

  await runTasksWithBoundedConcurrency(
    data.transactions,
    AppConfig.performance.maxConcurrentOperations,
    async (transaction, index) => {
      if (preserveTransactionIds.has(transaction.id)) {
        results[index] = { transaction };
        return;
      }

      if (hasValidRate(transaction.exchangeRate)) {
        results[index] = { transaction };
        return;
      }

      const journal = journalById.get(transaction.journalId);
      if (!journal) {
        results[index] = {
          transaction,
          warning: `Journal currency unavailable for transaction ${transaction.id}; no historical exchange rate was added.`,
        };
        return;
      }

      const fromCurrency = transaction.currencyCode.trim().toUpperCase();
      const journalCurrency = journal.currencyCode.trim().toUpperCase();
      if (!fromCurrency || !journalCurrency) {
        results[index] = {
          transaction,
          warning: `Currency unavailable for transaction ${transaction.id}; no historical exchange rate was added.`,
        };
        return;
      }
      if (fromCurrency === journalCurrency) {
        results[index] = { transaction };
        return;
      }

      const date = getJournalHistoricalFxTimestamp(journal.journalDate);
      const dateKey = getJournalFxDateKey(journal.journalDate) ?? 'invalid date';
      if (date === undefined) {
        results[index] = {
          transaction,
          warning: `Historical exchange rate unavailable for transaction ${transaction.id} (${fromCurrency} -> ${journalCurrency} on ${dateKey}): invalid journal date.`,
        };
        return;
      }
      try {
        const quote = await exchangeRateService.getHistoricalRate(
          fromCurrency,
          journalCurrency,
          date,
        );
        results[index] = { transaction: { ...transaction, exchangeRate: quote.rate } };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        results[index] = {
          transaction,
          warning: `Historical exchange rate unavailable for transaction ${transaction.id} (${fromCurrency} -> ${journalCurrency} on ${dateKey}): ${reason}`,
        };
      }
    },
  );

  return {
    data: { ...data, transactions: results.map(result => result.transaction) },
    warnings: results.flatMap(result => (result.warning ? [result.warning] : [])),
  };
}
