import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { DateRange } from '@/src/hooks/usePaginatedObservable';
import { observeEnrichedJournals } from '@/src/services/journal/journalEnrichedObserver';
import { AccountId, DisplayTransaction, TransactionId, WorkplaceId } from '@/src/types/domain';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/** Maps enriched journals to per-account display rows for ledger UIs. */
export function observeDisplayTransactionsForAccounts(
  accountIds: AccountId[],
  workplaceId: WorkplaceId,
  limit: number,
  dateRange?: DateRange,
): Observable<DisplayTransaction[]> {
  const rangeParam = dateRange
    ? {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        accountIds,
      }
    : { accountIds, startDate: 0, endDate: Number.MAX_SAFE_INTEGER };

  return observeEnrichedJournals(workplaceId, limit, rangeParam).pipe(
    map(journals => {
      const displayTxs: DisplayTransaction[] = [];
      for (const j of journals) {
        for (const acc of j.accounts) {
          if (accountIds.includes(acc.id as AccountId)) {
            displayTxs.push({
              id: `${j.id}_${acc.id}` as TransactionId,
              journalId: j.id,
              accountId: acc.id as AccountId,
              amount: j.totalAmount,
              currencyCode: j.currencyCode,
              transactionType:
                acc.role === 'SOURCE' ? TransactionType.CREDIT : TransactionType.DEBIT,
              transactionDate: j.journalDate,
              notes: j.notes,
              journalDescription: j.description,
              accountName: acc.name,
              accountType: acc.accountType as AccountType,
              icon: acc.icon,
              displayTitle: j.description || 'Transaction',
              displayType: j.displayType,
              isIncrease: acc.role === 'DESTINATION',
            });
          }
        }
      }
      return displayTxs;
    }),
  );
}

export function observeDisplayTransactionsForAccount(
  accountId: AccountId,
  workplaceId: WorkplaceId,
  limit: number,
  dateRange?: DateRange,
): Observable<DisplayTransaction[]> {
  return observeDisplayTransactionsForAccounts([accountId], workplaceId, limit, dateRange);
}
