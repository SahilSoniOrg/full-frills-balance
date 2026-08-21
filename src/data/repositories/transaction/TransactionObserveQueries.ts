import { AppConfig } from '@/src/constants/app-config';
import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Q } from '@nozbe/watermelondb';
import { Observable, of } from 'rxjs';
import { buildActiveClauses, deterministicSort } from './transactionActiveClauses';

export class TransactionObserveQueries {
  private get transactions() {
    return database.collections.get<Transaction>('transactions');
  }

  observeByAccounts(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
    limit: number = AppConfig.pagination.defaultPageSize,
    dateRange?: { startDate: number; endDate: number },
  ): Observable<Transaction[]> {
    const clauses = buildActiveClauses(workplaceId, [Q.where('account_id', Q.oneOf(accountIds))]);

    if (dateRange) {
      clauses.push(Q.where('transaction_date', Q.gte(dateRange.startDate)));
      clauses.push(Q.where('transaction_date', Q.lte(dateRange.endDate)));
    }

    return deterministicSort(this.transactions.query(...clauses), Q.desc)
      .extend(Q.take(limit))
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

  observeByJournals(workplaceId: WorkplaceId, journalIds: JournalId[]): Observable<Transaction[]> {
    if (journalIds.length === 0) return of([] as Transaction[]);
    return this.transactions
      .query(
        Q.where('journal_id', Q.oneOf(journalIds)),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('workplace_id', workplaceId),
      )
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
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES, 'PLANNED'])),
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
    return this.transactions.query(...buildActiveClauses(workplaceId)).observeCount(shouldThrottle);
  }

  observeActiveWithColumns(workplaceId: WorkplaceId, columns: string[]): Observable<Transaction[]> {
    return this.transactions.query(...buildActiveClauses(workplaceId)).observeWithColumns(columns);
  }

  /**
   * Observe transactions within a date range.
   * Use this instead of observeActive() when you only need a bounded window —
   * avoids deserializing the entire transaction history across the bridge.
   */
  observeByDateRange(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate?: number,
  ): Observable<Transaction[]> {
    const extra: Q.Clause[] = [Q.where('transaction_date', Q.gte(startDate))];
    if (endDate !== undefined) {
      extra.push(Q.where('transaction_date', Q.lte(endDate)));
    }

    return this.transactions
      .query(...buildActiveClauses(workplaceId, extra))
      .observeWithColumns([
        'amount',
        'account_id',
        'transaction_date',
        'journal_id',
        'currency_code',
        'transaction_type',
        'exchange_rate',
        'updated_at',
      ]);
  }

  observeByAccountDateRange(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    startDate: number,
    endDate: number,
  ): Observable<Transaction[]> {
    return this.transactions
      .query(
        ...buildActiveClauses(workplaceId, [
          Q.where('account_id', accountId),
          Q.where('transaction_date', Q.gte(startDate)),
          Q.where('transaction_date', Q.lte(endDate)),
        ]),
        Q.sortBy('transaction_date', Q.asc),
      )
      .observeWithColumns(['running_balance', 'transaction_date']);
  }

  observeCountByDateRange(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    shouldThrottle: boolean = true,
  ): Observable<number> {
    return this.transactions
      .query(
        ...buildActiveClauses(workplaceId, [
          Q.where('transaction_date', Q.gte(startDate)),
          Q.where('transaction_date', Q.lte(endDate)),
        ]),
      )
      .observeCount(shouldThrottle);
  }

  observeByDateRangeWithColumns(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    columns: string[],
  ): Observable<Transaction[]> {
    return this.transactions
      .query(
        ...buildActiveClauses(workplaceId, [
          Q.where('transaction_date', Q.gte(startDate)),
          Q.where('transaction_date', Q.lte(endDate)),
        ]),
      )
      .observeWithColumns(columns);
  }
}

export const transactionObserveQueries = new TransactionObserveQueries();
