import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import Transaction from '@/src/data/models/Transaction';
import { AccountId, AccountType, WorkplaceId } from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Q } from '@nozbe/watermelondb';
import { distinctUntilChanged, map, of, Observable } from 'rxjs';

export class AccountObserveQueries {
  private get db() {
    return database;
  }

  private get accounts() {
    return this.db.collections.get<Account>('accounts');
  }

  private get metadata() {
    return this.db.collections.get<AccountMetadata>('account_metadata');
  }

  observeAll(workplaceId: WorkplaceId): Observable<Account[]> {
    const clauses: Q.Clause[] = [
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
      Q.sortBy('order_num', Q.asc),
    ];
    return this.accounts
      .query(...clauses)
      .observeWithColumns([
        'account_type',
        'account_subtype',
        'name',
        'order_num',
        'currency_code',
        'icon',
        'color',
        'description',
        'parent_account_id',
        'deleted_at',
        'archived_at',
        'reconciled_at',
        'updated_at',
      ]);
  }

  observeHierarchy(workplaceId: WorkplaceId): Observable<Account[]> {
    const clauses: Q.Clause[] = [
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    return this.accounts
      .query(...clauses)
      .observeWithColumns(['parent_account_id', 'deleted_at', 'archived_at']);
  }

  observeByType(workplaceId: WorkplaceId, accountType: AccountType): Observable<Account[]> {
    const clauses: Q.Clause[] = [
      Q.where('account_type', accountType),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
      Q.sortBy('order_num', Q.asc),
    ];
    return this.accounts
      .query(...clauses)
      .observeWithColumns([
        'name',
        'account_subtype',
        'order_num',
        'currency_code',
        'icon',
        'color',
        'description',
        'parent_account_id',
        'deleted_at',
        'archived_at',
      ]);
  }

  observeByIds(workplaceId: WorkplaceId, accountIds: AccountId[]): Observable<Account[]> {
    if (accountIds.length === 0) {
      return of([] as Account[]);
    }

    const clauses: Q.Clause[] = [
      Q.where('id', Q.oneOf(accountIds)),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];

    return this.accounts
      .query(...clauses)
      .observeWithColumns([
        'name',
        'account_type',
        'account_subtype',
        'currency_code',
        'order_num',
        'icon',
        'color',
        'description',
        'parent_account_id',
        'deleted_at',
        'archived_at',
      ]);
  }

  observeById(workplaceId: WorkplaceId, accountId: AccountId): Observable<Account | null> {
    return this.accounts
      .query(Q.where('id', accountId), Q.where('workplace_id', workplaceId))
      .observeWithColumns([
        'name',
        'account_type',
        'account_subtype',
        'currency_code',
        'icon',
        'color',
        'description',
        'parent_account_id',
        'deleted_at',
        'archived_at',
        'reconciled_at',
        'updated_at',
      ])
      .pipe(
        map(accounts => {
          const account = accounts[0];
          return account && !account.deletedAt ? account : null;
        }),
      );
  }

  /** Primitive archived_at for React — avoids stale UI from stable model references. */
  observeArchivedAt(workplaceId: WorkplaceId, accountId: AccountId): Observable<number | null> {
    return this.accounts
      .query(
        Q.where('id', accountId),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observeWithColumns(['archived_at', 'deleted_at'])
      .pipe(
        map(accounts => {
          const account = accounts[0];
          if (!account) return null;
          return account.archivedAt?.getTime() ?? null;
        }),
        distinctUntilChanged(),
      );
  }

  /** Primitive reconciled_at (ms) for React — avoids stale UI from the dashboard balance pipeline. */
  observeReconciledAt(workplaceId: WorkplaceId, accountId: AccountId): Observable<number | null> {
    return this.accounts
      .query(
        Q.where('id', accountId),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observeWithColumns(['reconciled_at', 'deleted_at'])
      .pipe(
        map(accounts => {
          const account = accounts[0];
          if (!account) return null;
          return account.reconciledAt?.getTime() ?? null;
        }),
        distinctUntilChanged(),
      );
  }

  /**
   * Observe all active transactions for an account.
   * Used for reactive in-memory balance calculation.
   */
  observeTransactionsForBalance(
    workplaceId: WorkplaceId,
    accountId: AccountId,
  ): Observable<Transaction[]> {
    const clauses: Q.Clause[] = [
      Q.experimentalJoinTables(['journals']),
      Q.where('account_id', accountId),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    clauses.push(
      Q.on('journals', [
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('workplace_id', workplaceId),
      ]),
    );

    return this.db.collections
      .get<Transaction>('transactions')
      .query(...clauses)
      .observe();
  }

  observeMetadata(workplaceId: WorkplaceId, accountId: AccountId): Observable<AccountMetadata[]> {
    return this.metadata
      .query(Q.where('account_id', accountId), Q.where('workplace_id', workplaceId))
      .observe();
  }

  observeByIdsWithDeleted(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Observable<Account[]> {
    if (accountIds.length === 0) {
      return of([] as Account[]);
    }

    const clauses: Q.Clause[] = [
      Q.where('id', Q.oneOf(accountIds)),
      Q.where('workplace_id', workplaceId),
    ];
    return this.accounts
      .query(...clauses)
      .observeWithColumns([
        'name',
        'account_type',
        'account_subtype',
        'currency_code',
        'color',
        'reconciled_at',
        'parent_account_id',
        'deleted_at',
        'archived_at',
      ]);
  }

  observeHasChildren(workplaceId: WorkplaceId, accountId: AccountId): Observable<boolean> {
    return this.accounts
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('parent_account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observe()
      .pipe(map(children => children.length > 0));
  }

  observeSubAccountCount(workplaceId: WorkplaceId, accountId: AccountId): Observable<number> {
    return this.accounts
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('parent_account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observeCount();
  }
}

export const accountObserveQueries = new AccountObserveQueries();
