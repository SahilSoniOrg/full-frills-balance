import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { Q } from '@nozbe/watermelondb';

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
    const metaToUpdate = await this.metadata
      .query(
        Q.where('pay_from_account_id', Q.oneOf(sourceAccountIds)),
        Q.where('workplace_id', workplaceId),
      )
      .fetch();

    const sourceMetadata = await this.metadata
      .query(Q.where('account_id', Q.oneOf(sourceAccountIds)), Q.where('workplace_id', workplaceId))
      .fetch();

    const subAccounts = await this.accounts
      .query(
        Q.where('parent_account_id', Q.oneOf(sourceAccountIds)),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();

    const sourceAccounts = await this.accounts
      .query(Q.where('id', Q.oneOf(sourceAccountIds)), Q.where('workplace_id', workplaceId))
      .fetch();

    const accountMutations = new Map<
      string,
      { parentId?: AccountId; deleted?: boolean; record: Account }
    >();
    const metadataMutations = new Map<string, { payFromId?: AccountId; record: AccountMetadata }>();

    metaToUpdate.forEach((m: AccountMetadata) => {
      if (!metadataMutations.has(m.id)) {
        metadataMutations.set(m.id, { record: m });
      }
      metadataMutations.get(m.id)!.payFromId = targetAccountId;
    });

    subAccounts.forEach((sa: Account) => {
      if (!accountMutations.has(sa.id)) {
        accountMutations.set(sa.id, { record: sa });
      }
      accountMutations.get(sa.id)!.parentId = targetAccountId;
    });

    sourceAccounts.forEach((s: Account) => {
      if (!accountMutations.has(s.id)) {
        accountMutations.set(s.id, { record: s });
      }
      accountMutations.get(s.id)!.deleted = true;
    });

    sourceMetadata.forEach((m: AccountMetadata) => {
      if (!metadataMutations.has(m.id)) {
        metadataMutations.set(m.id, { record: m });
      }
    });

    const ops: (Account | AccountMetadata)[] = [];

    accountMutations.forEach(({ record, parentId, deleted }) => {
      ops.push(
        record.prepareUpdate((r: Account) => {
          if (parentId) r.parentAccountId = parentId;
          if (deleted) r.deletedAt = new Date();
          r.updatedAt = new Date();
        }),
      );
    });

    metadataMutations.forEach(({ record, payFromId }) => {
      ops.push(
        record.prepareUpdate((r: AccountMetadata) => {
          if (payFromId) r.payFromAccountId = payFromId;
          r.updatedAt = new Date();
        }),
      );
    });

    return ops;
  }
}

export const accountMergeOperations = new AccountMergeOperations();
