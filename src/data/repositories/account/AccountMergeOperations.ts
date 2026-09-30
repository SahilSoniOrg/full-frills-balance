import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import AuditLog from '@/src/data/models/AuditLog';
import {
  stageModelWrite,
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
  audits: AuditLog[];
};

function metadataAuditState(record: AccountMetadata): Record<string, unknown> {
  return {
    statementDay: record.statementDay ?? null,
    dueDay: record.dueDay ?? null,
    minimumPaymentAmount: record.minimumPaymentAmount ?? null,
    minimumBalanceAmount: record.minimumBalanceAmount ?? null,
    creditLimitAmount: record.creditLimitAmount ?? null,
    aprBps: record.aprBps ?? null,
    emiDay: record.emiDay ?? null,
    loanTenureMonths: record.loanTenureMonths ?? null,
    autopayEnabled: record.autopayEnabled ?? null,
    gracePeriodDays: record.gracePeriodDays ?? null,
    payFromAccountId: record.payFromAccountId ?? null,
    minPaymentOnly: record.minPaymentOnly ?? null,
    minimumPaymentPercent: record.minimumPaymentPercent ?? null,
    notes: record.notes ?? null,
  };
}

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
    correlationId?: string,
  ): Promise<void> {
    const records = await this.loadMergeRecords(workplaceId, sourceAccountIds, targetAccountId);
    if (records.sourceAccounts.length !== sourceAccountIds.length) {
      throw new Error('One or more source accounts could not be found in the workplace');
    }

    stageModelWrite(session, () => {
      const { accounts, metadata, audits } = this.prepareLoadedMergeWriteOperations(
        records,
        sourceAccountIds,
        targetAccountId,
        correlationId,
      );
      return [
        ...accounts,
        ...metadata,
        ...audits,
        auditRepository.prepareLog(
          {
            entityType: 'account',
            entityId: targetAccountId,
            eventType: 'account.merged',
            action: AuditAction.UPDATE,
            source: 'app',
            correlationId,
            changes: { action: 'MERGE_ACCOUNTS', mergedAccountIds: sourceAccountIds },
            undoable: false,
          },
          workplaceId,
        ),
      ];
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
    correlationId?: string,
  ): AccountMergeWriteOperations {
    const sourceIds = new Set<string>(sourceAccountIds);
    const movedChildren = records.sourceChildren
      .filter(child => !sourceIds.has(child.id))
      .sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0) || a.id.localeCompare(b.id));
    const nextOrder =
      records.targetChildren.reduce((max, child) => Math.max(max, child.orderNum ?? -1), -1) + 1;
    const accounts: Account[] = [];
    const metadata: AccountMetadata[] = [];
    const audits: AuditLog[] = [];
    const now = new Date();
    const sourceMetadataByAccountId = new Map(
      records.sourceMetadata.map(record => [record.accountId, record]),
    );
    movedChildren.forEach((record, index) => {
      const nextOrderNum = nextOrder + index;
      const before = {
        name: record.name,
        parentAccountId: record.parentAccountId ?? null,
        orderNum: record.orderNum ?? null,
      };
      accounts.push(
        record.prepareUpdate(updated => {
          updated.parentAccountId = targetAccountId;
          updated.orderNum = nextOrderNum;
          updated.updatedAt = now;
        }),
      );
      audits.push(
        auditRepository.prepareLog(
          {
            entityType: 'account',
            entityId: record.id,
            eventType: 'account.hierarchy_retargeted',
            action: AuditAction.UPDATE,
            source: 'app',
            correlationId,
            changes: {
              before,
              after: {
                name: record.name,
                parentAccountId: targetAccountId,
                orderNum: nextOrderNum,
              },
            },
            undoable: false,
          },
          record.workplaceId,
        ),
      );
    });
    records.sourceAccounts.forEach(record => {
      const sourceMetadata = sourceMetadataByAccountId.get(record.id);
      accounts.push(
        record.prepareUpdate(updated => {
          updated.deletedAt = now;
          updated.updatedAt = now;
        }),
      );
      audits.push(
        auditRepository.prepareLog(
          {
            entityType: 'account',
            entityId: record.id,
            eventType: 'account.merged_into',
            action: AuditAction.UPDATE,
            source: 'app',
            correlationId,
            changes: {
              before: {
                name: record.name,
                deletedAt: null,
                ...(sourceMetadata ? { metadata: metadataAuditState(sourceMetadata) } : {}),
              },
              after: {
                name: record.name,
                deletedAt: now,
                ...(sourceMetadata ? { metadata: null } : {}),
              },
              mergedIntoAccountId: targetAccountId,
            },
            undoable: false,
          },
          record.workplaceId,
        ),
      );
    });
    records.metadataToRetarget
      .filter(record => !sourceIds.has(record.accountId))
      .forEach(record => {
        const before = metadataAuditState(record);
        const after = { ...before, payFromAccountId: targetAccountId };
        metadata.push(
          record.prepareUpdate(updated => {
            updated.payFromAccountId = targetAccountId;
            updated.updatedAt = now;
          }),
        );
        audits.push(
          auditRepository.prepareLog(
            {
              entityType: 'account',
              entityId: record.accountId,
              eventType: 'account.payment_source_retargeted',
              action: AuditAction.UPDATE,
              source: 'app',
              correlationId,
              changes: { before: { metadata: before }, after: { metadata: after } },
              undoable: false,
            },
            record.workplaceId,
          ),
        );
      });
    metadata.push(...records.sourceMetadata.map(record => record.prepareDestroyPermanently()));

    return { accounts, metadata, audits };
  }
}

export const accountMergeOperations = new AccountMergeOperations();
