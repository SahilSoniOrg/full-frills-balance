import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { observeQueryWithModelChanges } from '@/src/data/repositories/observeQueryWithModelChanges';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { Q } from '@nozbe/watermelondb';
import { distinctUntilChanged, map, of, Observable } from 'rxjs';
import { buildAccountClauses } from './accountFilters';

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
    return this.accounts
      .query(...buildAccountClauses({ workplaceId, sortByOrder: true }))
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

  observeByType(workplaceId: WorkplaceId, accountType: AccountType): Observable<Account[]> {
    return this.accounts
      .query(...buildAccountClauses({ workplaceId, accountType, sortByOrder: true }))
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

    return this.accounts
      .query(...buildAccountClauses({ workplaceId, accountIds }))
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
      .query(...buildAccountClauses({ workplaceId, accountIds: [accountId] }))
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
      .query(...buildAccountClauses({ workplaceId, accountIds: [accountId] }))
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
      .query(...buildAccountClauses({ workplaceId, accountIds: [accountId] }))
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

  observeMetadata(workplaceId: WorkplaceId, accountId: AccountId): Observable<AccountMetadata[]> {
    return observeQueryWithModelChanges(
      this.metadata.query(Q.where('account_id', accountId), Q.where('workplace_id', workplaceId)),
    );
  }

  observeByIdsWithDeleted(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Observable<Account[]> {
    if (accountIds.length === 0) {
      return of([] as Account[]);
    }

    return this.accounts
      .query(...buildAccountClauses({ workplaceId, accountIds, includeDeleted: true }))
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
      .query(...buildAccountClauses({ workplaceId, parentAccountId: accountId }))
      .observe()
      .pipe(map(children => children.length > 0));
  }
}

export const accountObserveQueries = new AccountObserveQueries();
