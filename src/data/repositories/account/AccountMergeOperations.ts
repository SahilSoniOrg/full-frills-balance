import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

export type AccountMergeRecords = {
  metadataToRetarget: AccountMetadata[];
  sourceMetadata: AccountMetadata[];
  sourceChildren: Account[];
  targetChildren: Account[];
  sourceAccounts: Account[];
};

/** Account merge read + prepareUpdate batching (metadata, sub-accounts, soft-delete sources). */
export class AccountMergeOperations {
  private get accounts() {
    return database.collections.get<Account>('accounts');
  }

  private get metadata() {
    return database.collections.get<AccountMetadata>('account_metadata');
  }

  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<(Account | AccountMetadata)[]> {
    const records = await this.loadMergeRecords(workplaceId, sourceAccountIds, targetAccountId);
    return this.prepareLoadedMergeOperations(records, sourceAccountIds, targetAccountId);
  }

  async loadMergeRecords(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<AccountMergeRecords> {
    const [metadataToRetarget, sourceMetadata, sourceChildren, targetChildren, sourceAccounts] =
      await Promise.all([
        this.metadata
          .query(
            Q.where('pay_from_account_id', Q.oneOf(sourceAccountIds)),
            Q.where('workplace_id', workplaceId),
          )
          .fetch(),
        this.metadata
          .query(
            Q.where('account_id', Q.oneOf(sourceAccountIds)),
            Q.where('workplace_id', workplaceId),
          )
          .fetch(),
        this.accounts
          .query(
            Q.where('parent_account_id', Q.oneOf(sourceAccountIds)),
            Q.where('workplace_id', workplaceId),
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetch(),
        this.accounts
          .query(
            Q.where('parent_account_id', targetAccountId),
            Q.where('workplace_id', workplaceId),
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetch(),
        this.accounts
          .query(Q.where('id', Q.oneOf(sourceAccountIds)), Q.where('workplace_id', workplaceId))
          .fetch(),
      ]);
    return { metadataToRetarget, sourceMetadata, sourceChildren, targetChildren, sourceAccounts };
  }

  prepareLoadedMergeOperations(
    records: AccountMergeRecords,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): (Account | AccountMetadata)[] {
    const sourceIds = new Set<string>(sourceAccountIds);
    const movedChildren = records.sourceChildren
      .filter(child => !sourceIds.has(child.id))
      .sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0) || a.id.localeCompare(b.id));
    const nextOrder =
      records.targetChildren.reduce((max, child) => Math.max(max, child.orderNum ?? -1), -1) + 1;
    const ops: (Account | AccountMetadata)[] = [];
    movedChildren.forEach((record, index) => {
      ops.push(
        record.prepareUpdate(updated => {
          updated.parentAccountId = targetAccountId;
          updated.orderNum = nextOrder + index;
          updated.updatedAt = new Date();
        }),
      );
    });
    records.sourceAccounts.forEach(record => {
      ops.push(
        record.prepareUpdate(updated => {
          updated.deletedAt = new Date();
          updated.updatedAt = new Date();
        }),
      );
    });
    records.metadataToRetarget
      .filter(record => !sourceIds.has(record.accountId))
      .forEach(record => {
        ops.push(
          record.prepareUpdate(updated => {
            updated.payFromAccountId = targetAccountId;
            updated.updatedAt = new Date();
          }),
        );
      });
    ops.push(...records.sourceMetadata.map(record => record.prepareDestroyPermanently()));

    return ops;
  }
}

export const accountMergeOperations = new AccountMergeOperations();
