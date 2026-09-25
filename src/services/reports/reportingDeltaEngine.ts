import Transaction from '@/src/data/models/Transaction';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { AppConfig } from '@/src/constants/app-config';
import { convertJournalLineAmount } from '@/src/services/currencyConversion';
import {
  ConvertedReportTransaction,
  ReportAccount,
  ReportingDeltaInput,
} from '@/src/services/reports/reportTypes';
import { WorkplaceId } from '@/src/types/ids';
import { effect } from '@/src/utils/accounting/BalanceEffects';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';
import { logger } from '@/src/utils/logger';
import dayjs from 'dayjs';

/**
 * Converts a batch of raw Transaction records to the target reporting currency. Unified
 * replacement for the two near-identical private methods
 * (getConvertedReportTransactions / getConvertedReportTransactionsFromRaw) that previously
 * lived in ReportService.
 */
export async function convertReportTransactions(
  transactions: Transaction[],
  targetCurrency: string,
  accounts: ReportAccount[],
  workplaceId: WorkplaceId,
): Promise<{ transactions: ConvertedReportTransaction[]; hasUnvaluedEntries: boolean }> {
  if (transactions.length === 0) return { transactions: [], hasUnvaluedEntries: false };

  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const journals = await journalQueryRepository.findByIds(workplaceId, [
    ...new Set(transactions.map(transaction => transaction.journalId)),
  ]);
  const journalById = new Map(journals.map(journal => [journal.id, journal]));
  const converted: (ConvertedReportTransaction | null)[] = new Array(transactions.length).fill(
    null,
  );
  const unvaluedEntries = new Array<boolean>(transactions.length).fill(false);

  await runTasksWithBoundedConcurrency(
    transactions,
    AppConfig.performance.maxConcurrentOperations,
    async (transaction, index) => {
      const account = accountMap.get(transaction.accountId);
      const journal = journalById.get(transaction.journalId);
      if (!account || !journal) {
        unvaluedEntries[index] = true;
        return;
      }

      const lineCurrency = transaction.currencyCode || account.currencyCode || journal.currencyCode;
      const result = await convertJournalLineAmount({
        amount: transaction.amount,
        lineCurrency,
        journalCurrency: journal.currencyCode,
        targetCurrency,
        storedLineRate: transaction.exchangeRate,
        journalDate: journal.journalDate,
      });
      if (!result.ok) {
        unvaluedEntries[index] = true;
        logger.warn('[reportingDeltaEngine] Skipping amount: journal FX unavailable', {
          transactionId: transaction.id,
          fromCurrency: result.missingRate.fromCurrency,
          toCurrency: result.missingRate.toCurrency,
          journalDate: journal.journalDate,
        });
        return;
      }

      converted[index] = {
        accountId: transaction.accountId,
        accountType: account.accountType,
        transactionType: transaction.transactionType,
        transactionDate: transaction.transactionDate,
        amount: result.amount,
      };
    },
  );

  return {
    transactions: converted.filter((row): row is ConvertedReportTransaction => row !== null),
    hasUnvaluedEntries: unvaluedEntries.some(Boolean),
  };
}

/**
 * Maps converted transactions into signed ReportingDeltaInput objects.
 */
export function mapTransactionsToReportingDeltas(
  transactions: ConvertedReportTransaction[],
  accounts: ReportAccount[],
  targetCurrency: string,
): ReportingDeltaInput[] {
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  return transactions.map(tx => {
    const acc = accountMap.get(tx.accountId);
    const type = acc?.accountType || tx.accountType;
    const delta = effect(type, tx.transactionType).delta(tx.amount);

    return {
      accountId: tx.accountId,
      currencyCode: targetCurrency,
      delta,
      dayStart: dayjs(tx.transactionDate).startOf('day').valueOf(),
      accountType: type,
    };
  });
}
