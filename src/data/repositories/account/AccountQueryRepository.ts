import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { Q, Query } from '@nozbe/watermelondb';
import { buildAccountClauses } from './accountFilters';

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
    const accounts = await this.accounts
      .query(...buildAccountClauses({ workplaceId, accountIds: [id] }))
      .fetch();
    return accounts[0] ?? null;
  }

  async findWithDeleted(workplaceId: WorkplaceId, id: AccountId): Promise<Account | null> {
    const accounts = await this.accounts
      .query(...buildAccountClauses({ workplaceId, accountIds: [id], includeDeleted: true }))
      .fetch();
    return accounts[0] ?? null;
  }

  async findMetadata(
    workplaceId: WorkplaceId,
    accountId: AccountId,
  ): Promise<AccountMetadata | null> {
    const records = await this.metadata
      .query(Q.where('account_id', accountId), Q.where('workplace_id', workplaceId))
      .fetch();
    return records[0] ?? null;
  }

  async findMetadataByAccountIds(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Promise<AccountMetadata[]> {
    if (accountIds.length === 0) return [];
    return this.metadata
      .query(Q.where('account_id', Q.oneOf(accountIds)), Q.where('workplace_id', workplaceId))
      .fetch();
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
    return this.accounts.query(...buildAccountClauses({ workplaceId, accountIds: ids })).fetch();
  }

  async findByName(workplaceId: WorkplaceId, name: string): Promise<Account | null> {
    const accounts = await this.accounts
      .query(...buildAccountClauses({ workplaceId, name }))
      .fetch();
    return accounts[0] || null;
  }

  async findAll(workplaceId: WorkplaceId): Promise<Account[]> {
    return this.accounts.query(...buildAccountClauses({ workplaceId, sortByOrder: true })).fetch();
  }

  async findByType(workplaceId: WorkplaceId, accountType: AccountType): Promise<Account[]> {
    return this.accounts
      .query(...buildAccountClauses({ workplaceId, accountType, sortByOrder: true }))
      .fetch();
  }

  async exists(workplaceId: WorkplaceId): Promise<boolean> {
    const count = await this.accounts.query(...buildAccountClauses({ workplaceId })).fetchCount();
    return count > 0;
  }

  queryByParentId(workplaceId: WorkplaceId, parentId: AccountId): Query<Account> {
    return this.accounts.query(
      ...buildAccountClauses({ workplaceId, parentAccountId: parentId, sortByOrder: true }),
    );
  }
}

export const accountQueryRepository = new AccountQueryRepository();
