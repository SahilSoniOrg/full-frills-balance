import Transaction from '@/src/data/models/Transaction';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import {
  ConvertedReportTransaction,
  ReportAccount,
  ReportingDeltaInput,
} from '@/src/services/reports/reportTypes';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { getAccountBalanceDelta } from '@/src/utils/accountingHelpers';
import { logger } from '@/src/utils/logger';
import dayjs from 'dayjs';

/**
 * Pre-fetches exchange rates and converts a batch of raw Transaction records to the target
 * reporting currency. Unified replacement for the two near-identical private methods
 * (getConvertedReportTransactions / getConvertedReportTransactionsFromRaw) that previously
 * lived in ReportService.
 */
export async function convertReportTransactions(
  transactions: Transaction[],
  targetCurrency: string,
  accounts: ReportAccount[],
): Promise<ConvertedReportTransaction[]> {
  if (transactions.length === 0) return [];

  const accountMap = new Map(accounts.map(a => [a.id, a]));

  // 1. Collect unique source currencies
  const sourceCurrencies = new Set<string>();
  transactions.forEach(tx => {
    const account = accountMap.get(tx.accountId);
    const txCurrency = tx.currencyCode || account?.currencyCode || targetCurrency;
    sourceCurrencies.add(txCurrency);
  });

  // 2. Pre-fetch rates in parallel
  await Promise.all(
    Array.from(sourceCurrencies).map(base => {
      const promise = exchangeRateService.fetchRatesForBase?.(base);
      return promise && typeof promise.catch === 'function'
        ? promise.catch(() => {})
        : Promise.resolve();
    }),
  );

  // 3. Synchronous conversion pass
  return transactions
    .map(tx => {
      const account = accountMap.get(tx.accountId);
      const accountType = account?.accountType;
      if (!accountType) return null;

      const txCurrency = tx.currencyCode || account?.currencyCode || targetCurrency;
      const rate = exchangeRateService.getRateSafe(txCurrency, targetCurrency);

      return {
        accountId: tx.accountId,
        accountType,
        transactionType: tx.transactionType,
        transactionDate: tx.transactionDate,
        amount: tx.amount * rate,
      };
    })
    .filter((row): row is ConvertedReportTransaction => !!row);
}

/**
 * Normalizes currency on an array of ReportingDeltaInput objects using cached rates.
 */
export async function normalizeDeltas<T extends ReportingDeltaInput>(
  deltas: T[],
  targetCurrency: string,
): Promise<T[]> {
  if (deltas.length === 0) return [];

  const sourceCurrencies = new Set<string>();
  deltas.forEach(d => sourceCurrencies.add(d.currencyCode));

  await Promise.all(
    Array.from(sourceCurrencies).map(base => {
      const promise = exchangeRateService.fetchRatesForBase?.(base);
      return promise && typeof promise.catch === 'function'
        ? promise.catch(() => {})
        : Promise.resolve();
    }),
  );

  return deltas.map(d => {
    const rate = exchangeRateService.getRateSafe(d.currencyCode, targetCurrency);
    return { ...d, delta: d.delta * rate };
  });
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
    const delta = getAccountBalanceDelta(tx.amount, type, tx.transactionType);

    return {
      accountId: tx.accountId,
      currencyCode: targetCurrency,
      delta,
      dayStart: dayjs(tx.transactionDate).startOf('day').valueOf(),
      accountType: type,
    };
  });
}

/**
 * Fetches raw deltas from the DB, normalizes currency, and falls back to in-memory
 * transaction scanning when the raw query returns empty (e.g. before running_balance rebuild).
 * Eliminates the as unknown as T double-cast that previously lived in ReportService.
 */
export async function getScopedReportingDeltas<T extends ReportingDeltaInput>(
  workplaceId: WorkplaceId,
  accountIds: AccountId[],
  startDate: number,
  endDate: number,
  targetCurrency: string,
  accounts: ReportAccount[],
  fetchRaw: (ids: AccountId[], start: number, end: number) => Promise<T[]>,
): Promise<ReportingDeltaInput[]> {
  if (accountIds.length === 0) return [];

  const items = await fetchRaw(accountIds, startDate, endDate);
  if (items.length > 0) {
    return normalizeDeltas(items, targetCurrency);
  }

  logger.metric('ReportService.getScopedDeltas.fallbackTriggered', 1, {
    accountCount: accountIds.length,
    rangeDays: dayjs(endDate).diff(dayjs(startDate), 'days'),
  });

  const transactions = await transactionRepository.findByAccountsAndDateRange(
    workplaceId,
    accountIds,
    startDate,
    endDate,
  );
  const converted = await convertReportTransactions(transactions, targetCurrency, accounts);
  return mapTransactionsToReportingDeltas(converted, accounts, targetCurrency);
}
