import { ObservableDateRange } from '@/src/types/journalTimeline';
import { observeEnrichedJournals } from '@/src/services/journal/journalEnrichedObserver';
import { buildDisplayTransactionsForScopedAccounts } from '@/src/services/ledger/ledgerDisplayTransactionMapping';
import { AccountId, DisplayTransaction, WorkplaceId } from '@/src/types/domain';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/** Maps enriched journals to per-account display rows for ledger UIs. */
export function observeDisplayTransactionsForAccounts(
  accountIds: AccountId[],
  workplaceId: WorkplaceId,
  limit: number,
  dateRange?: ObservableDateRange,
): Observable<DisplayTransaction[]> {
  const rangeParam = dateRange
    ? {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        accountIds,
      }
    : { accountIds, startDate: 0, endDate: Number.MAX_SAFE_INTEGER };

  return observeEnrichedJournals(workplaceId, limit, rangeParam).pipe(
    map(journals => buildDisplayTransactionsForScopedAccounts(journals, accountIds)),
  );
}

export function observeDisplayTransactionsForAccount(
  accountId: AccountId,
  workplaceId: WorkplaceId,
  limit: number,
  dateRange?: ObservableDateRange,
): Observable<DisplayTransaction[]> {
  return observeDisplayTransactionsForAccounts([accountId], workplaceId, limit, dateRange);
}
