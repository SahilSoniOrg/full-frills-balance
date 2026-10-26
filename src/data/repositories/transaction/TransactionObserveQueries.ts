import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import {
  Observable,
  asyncScheduler,
  defer,
  distinctUntilChanged,
  finalize,
  map,
  shareReplay,
  switchMap,
  throttleTime,
} from 'rxjs';
import {
  buildActiveClauses,
  deterministicSort,
  EDITOR_JOURNAL_STATUSES,
} from './transactionActiveClauses';

export class TransactionObserveQueries {
  private readonly activeCounts = new Map<
    string,
    { observable: Observable<number>; subscribers: number }
  >();

  private get transactions() {
    return database.collections.get<Transaction>('transactions');
  }

  observeByJournal(
    workplaceId: WorkplaceId,
    journalId: JournalId,
    includeDeleted: boolean = false,
  ): Observable<Transaction[]> {
    const clauses: Q.Clause[] = [
      Q.experimentalJoinTables(['journals']),
      Q.where('journal_id', journalId),
      Q.where('workplace_id', workplaceId),
    ];

    if (!includeDeleted) {
      clauses.push(Q.where('deleted_at', Q.eq(null)));
      clauses.push(
        Q.on('journals', [
          Q.where('status', Q.oneOf([...EDITOR_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('workplace_id', workplaceId),
        ]),
      );
    }

    return this.transactions
      .query(...clauses)
      .extend(Q.sortBy('transaction_date', Q.asc))
      .extend(Q.sortBy('created_at', Q.asc))
      .observeWithColumns([
        'amount',
        'currency_code',
        'transaction_type',
        'transaction_date',
        'notes',
        'running_balance',
        'exchange_rate',
        'account_id',
        'journal_id',
      ]);
  }

  /**
   * Observe the COUNT of active transactions.
   * Efficient trigger: Signals changes without loading full models into memory.
   */
  observeActiveCount(workplaceId: WorkplaceId, shouldThrottle: boolean = true): Observable<number> {
    const key = `${workplaceId}:${shouldThrottle}`;
    return defer(() => {
      let observation = this.activeCounts.get(key);
      if (!observation) {
        const query = this.transactions.query(...buildActiveClauses(workplaceId));
        const changes = database.withChangesForTables(query.allTables);
        // Preserve writes inside the throttle window; Watermelon's built-in
        // throttled count observer drops these without a trailing notification.
        const invalidations = shouldThrottle
          ? changes.pipe(throttleTime(250, asyncScheduler, { leading: true, trailing: true }))
          : changes;
        observation = {
          observable: invalidations.pipe(
            switchMap(() => query.fetchCount()),
            distinctUntilChanged(),
            shareReplay({ bufferSize: 1, refCount: true }),
          ),
          subscribers: 0,
        };
        this.activeCounts.set(key, observation);
      }
      const active = observation;
      active.subscribers += 1;
      // Retain no query or result after its last consumer unsubscribes.
      return active.observable.pipe(
        finalize(() => {
          active.subscribers -= 1;
          if (active.subscribers === 0) this.activeCounts.delete(key);
        }),
      );
    });
  }

  /** Deliberately includes deleted lines and every journal status. */
  observeCountByAccountIncludingDeleted(
    workplaceId: WorkplaceId,
    accountId: AccountId,
  ): Observable<number> {
    return this.transactions
      .query(Q.where('workplace_id', workplaceId), Q.where('account_id', accountId))
      .observeCount(false);
  }

  observeActiveWithColumns(workplaceId: WorkplaceId, columns: string[]): Observable<Transaction[]> {
    return this.transactions.query(...buildActiveClauses(workplaceId)).observeWithColumns(columns);
  }

  observeByAccountDateRange(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    startDate: number,
    endDate: number,
  ): Observable<Transaction[]> {
    return deterministicSort(
      this.transactions.query(
        ...buildActiveClauses(workplaceId, [
          Q.where('account_id', accountId),
          Q.where('transaction_date', Q.gte(startDate)),
          Q.where('transaction_date', Q.lte(endDate)),
        ]),
      ),
      Q.asc,
    ).observeWithColumns(['running_balance', 'transaction_date', 'created_at']);
  }

  /** Running balance after the account's last leg dated before `beforeDate`; 0 when there is none. */
  observeBalanceBefore(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    beforeDate: number,
  ): Observable<number> {
    return deterministicSort(
      this.transactions.query(
        ...buildActiveClauses(workplaceId, [
          Q.where('account_id', accountId),
          Q.where('transaction_date', Q.lt(beforeDate)),
          Q.where('running_balance', Q.notEq(null)),
        ]),
        Q.take(1),
      ),
    )
      .observeWithColumns(['running_balance', 'transaction_date', 'created_at'])
      .pipe(map(([latest]) => latest?.runningBalance ?? 0));
  }
}

export const transactionObserveQueries = new TransactionObserveQueries();
