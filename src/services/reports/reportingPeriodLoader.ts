import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import {
  convertReportTransactions,
  mapTransactionsToReportingDeltas,
} from '@/src/services/reports/reportingDeltaEngine';
import {
  ConvertedReportTransaction,
  ReportAccount,
  ReportingDeltaInput,
} from '@/src/services/reports/reportTypes';
import { AccountId, WorkplaceId } from '@/src/types/ids';

export interface ReportingPeriodData {
  /** Per-posting period deltas, converted before any total is aggregated. */
  accountPeriodDeltas: ReportingDeltaInput[];
  /** Per-posting day deltas for history and daily income vs expense charts. */
  dailyDeltas: ReportingDeltaInput[];
  /** Converted transactions for spending heatmap (requires hour-level granularity). */
  convertedTransactions: ConvertedReportTransaction[];
  hasUnvaluedEntries: boolean;
}

/**
 * Account-period deltas converted posting by posting.
 * Used by lightweight callers such as the accounts list period totals.
 */
export async function loadAccountPeriodReportingDeltas(
  workplaceId: WorkplaceId,
  accountIds: AccountId[],
  startDate: number,
  endDate: number,
  currency: string,
  accounts: ReportAccount[],
): Promise<{ deltas: ReportingDeltaInput[]; hasUnvaluedEntries: boolean }> {
  const transactions = await transactionQueryRepository.findByAccountsAndDateRange(
    workplaceId,
    accountIds,
    startDate,
    endDate,
  );
  const converted = await convertReportTransactions(transactions, currency, accounts, workplaceId);
  return {
    deltas: mapTransactionsToReportingDeltas(converted.transactions, accounts, currency),
    hasUnvaluedEntries: converted.hasUnvaluedEntries,
  };
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
    return {
      accountPeriodDeltas: [],
      dailyDeltas: [],
      convertedTransactions: [],
      hasUnvaluedEntries: false,
    };
  }

  const transactions = await transactionQueryRepository.findByAccountsAndDateRange(
    workplaceId,
    allIds,
    startDate,
    endDate,
  );

  const converted = await convertReportTransactions(
    transactions,
    currency,
    allAccounts,
    workplaceId,
  );
  const convertedTransactions = converted.transactions;
  const transactionDeltas = mapTransactionsToReportingDeltas(
    convertedTransactions,
    allAccounts,
    currency,
  );

  // Keep each converted posting until report aggregation so minor-unit rounding
  // matches the journal evaluator for every line.
  return {
    accountPeriodDeltas: transactionDeltas,
    dailyDeltas: transactionDeltas,
    convertedTransactions,
    hasUnvaluedEntries: converted.hasUnvaluedEntries,
  };
}
