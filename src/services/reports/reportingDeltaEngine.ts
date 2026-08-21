import Transaction from '@/src/data/models/Transaction';
import { convertAmount } from '@/src/services/currencyConversion';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import {
  ConvertedReportTransaction,
  ReportAccount,
  ReportingDeltaInput,
} from '@/src/services/reports/reportTypes';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { effect } from '@/src/utils/accounting/BalanceEffects';
import { logger } from '@/src/utils/logger';
import dayjs from 'dayjs';

async function convertReportingAmount(
  amount: number,
  fromCurrency: string,
  targetCurrency: string,
  storedExchangeRate?: number,
): Promise<number | null> {
  const result = await convertAmount({
    amount,
    fromCurrency,
    toCurrency: targetCurrency,
    mode: 'historical',
    storedExchangeRate,
  });
  if (!result.ok) {
    logger.warn(
      `[reportingDeltaEngine] Skipping amount: FX unavailable (${fromCurrency} -> ${targetCurrency})`,
    );
    return null;
  }
  return result.amount;
}

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

  const converted = await Promise.all(
    transactions.map(async tx => {
      const account = accountMap.get(tx.accountId);
      const accountType = account?.accountType;
      if (!accountType) return null;

      const txCurrency = tx.currencyCode || account?.currencyCode || targetCurrency;
      const amount = await convertReportingAmount(
        tx.amount,
        txCurrency,
        targetCurrency,
        tx.exchangeRate,
      );
      if (amount === null) return null;

      return {
        accountId: tx.accountId,
        accountType,
        transactionType: tx.transactionType,
        transactionDate: tx.transactionDate,
        amount,
      };
    }),
  );

  return converted.filter((row): row is ConvertedReportTransaction => !!row);
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

  const normalized: T[] = [];
  for (const row of await Promise.all(
    deltas.map(async d => {
      if (d.currencyCode === targetCurrency) {
        return d;
      }
      const convertedDelta = await convertReportingAmount(
        d.delta,
        d.currencyCode,
        targetCurrency,
        d.exchangeRate,
      );
      if (convertedDelta === null) {
        return null;
      }
      return { ...d, delta: convertedDelta, currencyCode: targetCurrency } as T;
    }),
  )) {
    if (row !== null) {
      normalized.push(row);
    }
  }
  return normalized;
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

  const transactions = await transactionQueryRepository.findByAccountsAndDateRange(
    workplaceId,
    accountIds,
    startDate,
    endDate,
  );
  const converted = await convertReportTransactions(transactions, targetCurrency, accounts);
  return mapTransactionsToReportingDeltas(converted, accounts, targetCurrency);
}
