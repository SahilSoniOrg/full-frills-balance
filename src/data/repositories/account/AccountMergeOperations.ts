import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import {
  stageAccountMergeWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { AuditAction } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

export type AccountMergeRecords = {
  metadataToRetarget: AccountMetadata[];
  sourceMetadata: AccountMetadata[];
  sourceChildren: Account[];
  targetChildren: Account[];
  sourceAccounts: Account[];
};

export type AccountMergeWriteOperations = {
  accounts: Account[];
  metadata: AccountMetadata[];
};

/** Account merge read + prepareUpdate batching (metadata, sub-accounts, soft-delete sources). */
export class AccountMergeOperations {
  private get accounts() {
    return database.collections.get<Account>('accounts');
  }

  private get metadata() {
    return database.collections.get<AccountMetadata>('account_metadata');
  }

  async mergeInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<void> {
    const records = await this.loadMergeRecords(workplaceId, sourceAccountIds, targetAccountId);
    if (records.sourceAccounts.length !== sourceAccountIds.length) {
      throw new Error('One or more source accounts could not be found in the workplace');
    }

    stageAccountMergeWrite(session, () => {
      const operations = this.prepareLoadedMergeWriteOperations(
        records,
        sourceAccountIds,
        targetAccountId,
      );
      return {
        ...operations,
        audits: [
          auditRepository.prepareLog(
            {
              entityType: 'account',
              entityId: targetAccountId,
              action: AuditAction.UPDATE,
              changes: { action: 'MERGE_ACCOUNTS', mergedAccountIds: sourceAccountIds },
            },
            workplaceId,
          ),
        ],
      };
    });
  }

  private async loadMergeRecords(
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

  private prepareLoadedMergeWriteOperations(
    records: AccountMergeRecords,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): AccountMergeWriteOperations {
    const sourceIds = new Set<string>(sourceAccountIds);
    const movedChildren = records.sourceChildren
      .filter(child => !sourceIds.has(child.id))
      .sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0) || a.id.localeCompare(b.id));
    const nextOrder =
      records.targetChildren.reduce((max, child) => Math.max(max, child.orderNum ?? -1), -1) + 1;
    const accounts: Account[] = [];
    const metadata: AccountMetadata[] = [];
    movedChildren.forEach((record, index) => {
      accounts.push(
        record.prepareUpdate(updated => {
          updated.parentAccountId = targetAccountId;
          updated.orderNum = nextOrder + index;
          updated.updatedAt = new Date();
        }),
      );
    });
    records.sourceAccounts.forEach(record => {
      accounts.push(
        record.prepareUpdate(updated => {
          updated.deletedAt = new Date();
          updated.updatedAt = new Date();
        }),
      );
    });
    records.metadataToRetarget
      .filter(record => !sourceIds.has(record.accountId))
      .forEach(record => {
        metadata.push(
          record.prepareUpdate(updated => {
            updated.payFromAccountId = targetAccountId;
            updated.updatedAt = new Date();
          }),
        );
      });
    metadata.push(...records.sourceMetadata.map(record => record.prepareDestroyPermanently()));

    return { accounts, metadata };
  }
}

export const accountMergeOperations = new AccountMergeOperations();
