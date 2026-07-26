import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import {
  convertReportTransactions,
  getScopedReportingDeltas,
  mapTransactionsToReportingDeltas,
  normalizeDeltas,
} from '@/src/services/reports/reportingDeltaEngine';
import {
  ConvertedReportTransaction,
  ReportAccount,
  ReportingDeltaInput,
} from '@/src/services/reports/reportTypes';
import { AccountId, WorkplaceId } from '@/src/types/domain';

export interface ReportingPeriodData {
  /** Per-account period totals — SQL aggregates when available, else transaction-mapped deltas. */
  accountPeriodDeltas: ReportingDeltaInput[];
  /** Day-bucketed deltas for history and daily income vs expense charts. */
  dailyDeltas: ReportingDeltaInput[];
  /** Converted transactions for spending heatmap (requires hour-level granularity). */
  convertedTransactions: ConvertedReportTransaction[];
}

/**
 * Account-period deltas only (raw SQL with transaction-scan fallback).
 * Used by lightweight callers such as the accounts list period totals.
 */
export async function loadAccountPeriodReportingDeltas(
  workplaceId: WorkplaceId,
  accountIds: AccountId[],
  startDate: number,
  endDate: number,
  currency: string,
  accounts: ReportAccount[],
): Promise<ReportingDeltaInput[]> {
  return getScopedReportingDeltas(
    workplaceId,
    accountIds,
    startDate,
    endDate,
    currency,
    accounts,
    (ids, start, end) =>
      transactionRawRepository.getAccountDeltasGroupedRaw(workplaceId, ids, start, end),
  );
}

/**
 * Loads everything needed for a full {@link ReportSnapshot}: shared account-period math with
 * {@link loadAccountPeriodReportingDeltas}, day buckets for charts, and transactions for heatmap.
 * Performs at most one transaction list fetch per call.
 */
export async function loadReportingPeriodData(
  workplaceId: WorkplaceId,
  allAccounts: ReportAccount[],
  startDate: number,
  endDate: number,
  currency: string,
): Promise<ReportingPeriodData> {
  const allIds = allAccounts.map(a => a.id);
  if (allIds.length === 0) {
    return { accountPeriodDeltas: [], dailyDeltas: [], convertedTransactions: [] };
  }

  const [rawAccountRows, rawDailyRows, transactions] = await Promise.all([
    transactionRawRepository.getAccountDeltasGroupedRaw(workplaceId, allIds, startDate, endDate),
    transactionRawRepository.getDailyDeltasGroupedRaw(workplaceId, allIds, startDate, endDate),
    transactionRepository.findByAccountsAndDateRange(workplaceId, allIds, startDate, endDate),
  ]);

  const convertedTransactions = await convertReportTransactions(
    transactions,
    currency,
    allAccounts,
  );
  const transactionDeltas = mapTransactionsToReportingDeltas(
    convertedTransactions,
    allAccounts,
    currency,
  );

  const accountPeriodDeltas =
    rawAccountRows.length > 0 ? await normalizeDeltas(rawAccountRows, currency) : transactionDeltas;

  const dailyDeltas =
    rawDailyRows.length > 0 ? await normalizeDeltas(rawDailyRows, currency) : transactionDeltas;

  return { accountPeriodDeltas, dailyDeltas, convertedTransactions };
}
