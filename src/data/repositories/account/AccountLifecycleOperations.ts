import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { WorkplaceId } from '@/src/types/ids';
import { Model } from '@nozbe/watermelondb';
import { accountQueryRepository } from './AccountQueryRepository';
import { commitAccountMutationPlan } from './accountMutationCommit';
import type { AccountAuditContribution, AccountMutationResult } from './accountWriteTypes';

/**
 * Prepares WatermelonDB operations to archive or unarchive accounts.
 */
export function prepareArchiveTargetOps(
  archiveTargets: Account[],
  unarchiveTargets: Account[],
  now: Date,
): Model[] {
  return [
    ...archiveTargets.map(account =>
      account.prepareUpdate(record => {
        record.archivedAt = now;
        record.updatedAt = now;
      }),
    ),
    ...unarchiveTargets.map(account =>
      account.prepareUpdate(record => {
        record.archivedAt = undefined;
        record.updatedAt = now;
      }),
    ),
  ];
}

export async function deleteAccount(
  workplaceId: WorkplaceId,
  account: Account,
  options: {
    audit?: AccountAuditContribution;
    extraOps?: (account: Account, deletedAt: Date) => Model[];
    validateCurrent?: (account: Account, metadata: AccountMetadata | null) => void | Promise<void>;
  } = {},
): Promise<AccountMutationResult> {
  return commitAccountMutationPlan(async () => {
    const currentAccount = await accountQueryRepository.find(workplaceId, account.id);
    if (!currentAccount) {
      throw new Error('Cannot delete account. Account not found in workplace provided.');
    }
    const currentMetadata =
      options.validateCurrent || options.extraOps
        ? await accountQueryRepository.findMetadata(workplaceId, account.id)
        : null;
    await options.validateCurrent?.(currentAccount, currentMetadata);

    const children = await accountQueryRepository
      .queryByParentId(workplaceId, currentAccount.id)
      .fetch();
    if (children.length > 0) {
      throw new Error('Cannot delete account with children. Please delete or move children first.');
    }

    const deletedAt = new Date();
    return {
      prepareOps: () => [
        currentAccount.prepareUpdate(record => {
          record.deletedAt = deletedAt;
          record.updatedAt = deletedAt;
        }),
        ...(options.audit
          ? [
              auditRepository.prepareLog(
                {
                  entityType: 'account',
                  entityId: currentAccount.id,
                  ...options.audit,
                },
                workplaceId,
              ),
            ]
          : []),
        ...(options.extraOps?.(currentAccount, deletedAt) ?? []),
      ],
      result: {
        account: currentAccount,
        commitFacts: { balanceRebuildAccountIds: [] },
      },
    };
  });
}

export async function recoverAccount(
  workplaceId: WorkplaceId,
  account: Account,
  options: {
    audit?: AccountAuditContribution;
    extraOps?: (account: Account, restoredAt: Date) => Model[];
    validateCurrent?: (account: Account, metadata: AccountMetadata | null) => void | Promise<void>;
  } = {},
): Promise<AccountMutationResult> {
  if (account.workplaceId !== workplaceId) {
    throw new Error('Account does not belong to the specified workplace');
  }
  return commitAccountMutationPlan(async () => {
    const currentAccount = await accountQueryRepository.findWithDeleted(workplaceId, account.id);
    if (!currentAccount) throw new Error('Account not found');
    const currentMetadata =
      options.validateCurrent || options.extraOps
        ? await accountQueryRepository.findMetadata(workplaceId, account.id)
        : null;
    await options.validateCurrent?.(currentAccount, currentMetadata);

    const restoredAt = new Date();
    return {
      prepareOps: () => [
        currentAccount.prepareUpdate(record => {
          record.deletedAt = undefined;
          record.updatedAt = restoredAt;
        }),
        ...(options.audit
          ? [
              auditRepository.prepareLog(
                {
                  entityType: 'account',
                  entityId: currentAccount.id,
                  ...options.audit,
                },
                workplaceId,
              ),
            ]
          : []),
        ...(options.extraOps?.(currentAccount, restoredAt) ?? []),
      ],
      result: {
        account: currentAccount,
        commitFacts: { balanceRebuildAccountIds: [] },
      },
    };
  });
}
