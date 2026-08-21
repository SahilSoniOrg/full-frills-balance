import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { AccountId, AccountType, WorkplaceId } from '@/src/types/domain';
import { Q, Query } from '@nozbe/watermelondb';

export class AccountQueryRepository {
  private get db() {
    return database;
  }

  private get accounts() {
    return this.db.collections.get<Account>('accounts');
  }

  private get metadata() {
    return this.db.collections.get<AccountMetadata>('account_metadata');
  }

  async find(workplaceId: WorkplaceId, id: AccountId): Promise<Account | null> {
    try {
      const account = await this.accounts.find(id);
      if (account.deletedAt) return null;
      if (account.workplaceId !== workplaceId) return null;
      return account;
    } catch {
      return null;
    }
  }

  async findWithDeleted(workplaceId: WorkplaceId, id: AccountId): Promise<Account | null> {
    try {
      const account = await this.accounts.find(id);
      if (account.workplaceId !== workplaceId) return null;
      return account;
    } catch {
      return null;
    }
  }

  async findMetadata(
    workplaceId: WorkplaceId,
    accountId: AccountId,
  ): Promise<AccountMetadata | null> {
    try {
      const clauses: Q.Clause[] = [
        Q.where('account_id', accountId),
        Q.where('workplace_id', workplaceId),
      ];
      const records = await this.metadata.query(...clauses).fetch();
      return records[0] || null;
    } catch {
      return null;
    }
  }

  async findMetadataByAccountIds(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Promise<AccountMetadata[]> {
    if (accountIds.length === 0) return [];
    const clauses: Q.Clause[] = [
      Q.where('account_id', Q.oneOf(accountIds)),
      Q.where('workplace_id', workplaceId),
    ];
    return await this.metadata.query(...clauses).fetch();
  }

  async findMetadataByPayFromAccountIds(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Promise<AccountMetadata[]> {
    if (accountIds.length === 0) return [];
    return this.metadata
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('pay_from_account_id', Q.oneOf(accountIds)),
      )
      .fetch();
  }

  async findAllByIds(workplaceId: WorkplaceId, ids: AccountId[]): Promise<Account[]> {
    if (ids.length === 0) return [];
    const clauses: Q.Clause[] = [
      Q.where('id', Q.oneOf(ids)),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    return this.accounts.query(...clauses).fetch();
  }

  async findByName(workplaceId: WorkplaceId, name: string): Promise<Account | null> {
    const clauses: Q.Clause[] = [
      Q.where('name', name),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    const accounts = await this.accounts.query(...clauses).fetch();
    return accounts[0] || null;
  }

  async findAll(workplaceId: WorkplaceId): Promise<Account[]> {
    const clauses: Q.Clause[] = [
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    clauses.push(Q.sortBy('order_num', Q.asc));
    return this.accounts.query(...clauses).fetch();
  }

  async findByType(workplaceId: WorkplaceId, accountType: AccountType): Promise<Account[]> {
    const clauses: Q.Clause[] = [
      Q.where('account_type', accountType),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    clauses.push(Q.sortBy('order_num', Q.asc));
    return this.accounts.query(...clauses).fetch();
  }

  async exists(workplaceId: WorkplaceId): Promise<boolean> {
    const clauses: Q.Clause[] = [Q.where('deleted_at', Q.eq(null))];
    if (workplaceId) {
      clauses.push(Q.where('workplace_id', workplaceId));
    }
    const count = await this.accounts.query(...clauses).fetchCount();
    return count > 0;
  }

  async countNonDeleted(workplaceId: WorkplaceId): Promise<number> {
    const clauses: Q.Clause[] = [
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    return this.accounts.query(...clauses).fetchCount();
  }

  queryByParentId(workplaceId: WorkplaceId, parentId: AccountId): Query<Account> {
    return this.accounts.query(
      Q.where('workplace_id', workplaceId),
      Q.where('parent_account_id', parentId),
      Q.where('deleted_at', Q.eq(null)),
      Q.sortBy('order_num', Q.asc),
    );
  }
}

export const accountQueryRepository = new AccountQueryRepository();
