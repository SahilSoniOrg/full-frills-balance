import { Animation } from '@/src/constants';
import { journalObserveQueries } from '@/src/data/repositories/journal/journalTimelineModule';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { balanceService } from '@/src/services/BalanceService';
import { AccountBalance, AccountId, WorkplaceId } from '@/src/types/domain';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';
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
