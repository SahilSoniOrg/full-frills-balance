import { database } from '@/src/data/database/Database';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Q } from '@nozbe/watermelondb';
import { map, of } from 'rxjs';

const JOURNAL_LIST_OBSERVE_COLUMNS = [
  'journal_date',
  'description',
  'notes',
  'currency_code',
  'status',
  'total_amount',
  'transaction_count',
  'display_type',
  'updated_at',
  'deleted_at',
] as const;

/** Reactive journal and account-transaction observation queries. */
export class JournalObserveQueries {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  private get transactions() {
    return database.collections.get<Transaction>('transactions');
  }

  observeByIdsWithDeleted(workplaceId: WorkplaceId, journalIds: JournalId[]) {
    if (journalIds.length === 0) {
      return of([] as Journal[]);
    }

    return this.journals
      .query(Q.where('id', Q.oneOf(journalIds)), Q.where('workplace_id', workplaceId))
      .observeWithColumns([...JOURNAL_LIST_OBSERVE_COLUMNS]);
  }

  observeAccountTransactions(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    limit: number,
    dateRange?: { startDate: number; endDate: number },
  ) {
    const clauses: Q.Clause[] = [
      Q.experimentalJoinTables(['journals']),
      Q.where('account_id', accountId),
      Q.where('workplace_id', workplaceId),
      Q.where('deleted_at', Q.eq(null)),
      Q.on('journals', [
        Q.where('workplace_id', workplaceId),
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.where('deleted_at', Q.eq(null)),
      ]),
      Q.sortBy('transaction_date', 'desc'),
      Q.take(limit),
    ];

    if (dateRange) {
      clauses.push(Q.where('transaction_date', Q.gte(dateRange.startDate)));
      clauses.push(Q.where('transaction_date', Q.lte(dateRange.endDate)));
    }

    return this.transactions
      .query(...clauses)
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
        'deleted_at',
      ]);
  }

  observeById(workplaceId: WorkplaceId, journalId: string, includeDeleted: boolean = false) {
    const clauses = [Q.where('id', journalId), Q.where('workplace_id', workplaceId)];
    if (!includeDeleted) {
      clauses.push(Q.where('deleted_at', Q.eq(null)));
    }

    return this.journals
      .query(...clauses)
      .observeWithColumns([...JOURNAL_LIST_OBSERVE_COLUMNS])
      .pipe(map(journals => journals[0] || null));
  }

  observeByIds(workplaceId: WorkplaceId, journalIds: JournalId[]) {
    if (journalIds.length === 0) return of([] as Journal[]);
    return this.journals
      .query(
        Q.where('id', Q.oneOf(journalIds)),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observeWithColumns([...JOURNAL_LIST_OBSERVE_COLUMNS]);
  }

  observeStatusMeta(workplaceId: WorkplaceId) {
    return this.journals
      .query(Q.where('deleted_at', Q.eq(null)), Q.where('workplace_id', workplaceId))
      .observeWithColumns(['status', 'deleted_at', 'journal_date', 'updated_at', 'total_amount']);
  }

  observePlannedInRange(workplaceId: WorkplaceId, startDate: number, endDate: number) {
    return this.journals
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('status', JournalStatus.PLANNED),
        Q.where('journal_date', Q.gte(startDate)),
        Q.where('journal_date', Q.lte(endDate)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observe();
  }
}

export const journalObserveQueries = new JournalObserveQueries();
