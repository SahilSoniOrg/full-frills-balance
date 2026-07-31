import { Animation } from '@/src/constants';
import Transaction from '@/src/data/models/Transaction';
import { journalObserveQueries } from '@/src/data/repositories/journal/journalTimelineModule';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { balanceService } from '@/src/services/BalanceService';
import { AccountBalance, AccountId, WorkplaceId } from '@/src/types/domain';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';
import { Q } from '@nozbe/watermelondb';
import { Observable, combineLatest, of, switchMap } from 'rxjs';

/**
 * Targeted single-account balance stream.
 * Invalidates on account identity or journal status changes — avoids workplace-wide
 * getAccountBalances scans used by list/dashboard aggregation.
 */
export function observeAccountBalance(
  workplaceId: WorkplaceId,
  accountId: AccountId | null,
): Observable<AccountBalance | null> {
  if (!accountId || !workplaceId) return of(null);

  return combineLatest([
    accountQueries.observeById(workplaceId, accountId),
    journalObserveQueries.observeStatusMeta(workplaceId),
  ]).pipe(
    firstFastDebounce(Animation.dataRefreshDebounce),
    switchMap(async ([account]) => {
      if (!account) return null;
      return balanceService.getAccountBalance(accountId, workplaceId);
    }),
  );
}

/** Unreconciled transaction count/total for an account after its reconcile watermark. */
export function observeUnreconciledMetrics(
  workplaceId: WorkplaceId,
  accountId: AccountId | null,
  reconciledAt: number | null,
  isAssetOrExpense: boolean,
): Observable<{ count: number; total: number }> {
  if (!accountId || !workplaceId) return of({ count: 0, total: 0 });
  return transactionRawRepository.observeUnreconciledMetricsRaw(
    workplaceId,
    accountId,
    reconciledAt,
    isAssetOrExpense,
  );
}

/** Period metrics for an account, kept behind the account read boundary. */
export function observeAccountPeriodMetrics(
  workplaceId: WorkplaceId,
  accountId: AccountId | null,
  startDate: number,
  endDate: number,
  isAssetOrExpense: boolean,
) {
  if (!accountId || !workplaceId) {
    return of({ totalIncrease: 0, totalDecrease: 0 });
  }
  return transactionRawRepository.observeAccountPeriodMetricsRaw(
    workplaceId,
    accountId,
    startDate,
    endDate,
    isAssetOrExpense,
  );
}

/** Active transaction stream used to invalidate account balance projections. */
export function observeActiveTransactions(workplaceId: WorkplaceId, columns: string[]) {
  return transactionRepository.observeActiveWithColumns(workplaceId, columns);
}

/** Chart-range transactions with running balance for rolling-balance series. */
export function observeAccountChartTransactions(
  workplaceId: WorkplaceId,
  accountId: AccountId | null,
  start: number,
  end: number,
): Observable<Transaction[]> {
  if (!accountId || !workplaceId) return of([]);
  return transactionRepository
    .transactionsQuery(
      Q.where('workplace_id', workplaceId),
      Q.where('account_id', accountId),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('transaction_date', Q.gte(start)),
      Q.where('transaction_date', Q.lte(end)),
      Q.sortBy('transaction_date', Q.asc),
    )
    .observeWithColumns(['running_balance', 'transaction_date']);
}
