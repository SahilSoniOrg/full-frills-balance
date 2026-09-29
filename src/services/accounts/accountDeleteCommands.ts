import { AuditAction } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { deleteBlockers, type DeleteBlocker } from '@/src/services/accounts/accountReferenceGraph';
import { assertAccountAuditSnapshot } from '@/src/services/accounts/accountAuditCommands';
import { analytics } from '@/src/services/analytics';

/** Format structured graph blockers into the user-facing delete Error message. */
export function formatAccountDeleteBlockersError(
  accountName: string,
  blockers: DeleteBlocker[],
): Error {
  const references = blockers.map(blocker => `${blocker.count} ${blocker.label}`).join(', ');
  return new Error(
    `Account "${accountName}" cannot be deleted while referenced by ${references}. ` +
      'Remove or retarget those references first (or merge into another account).',
  );
}

export async function deleteAccount(
  accountId: AccountId,
  workplaceId: WorkplaceId,
  auditOptions: {
    revertsLogId?: string;
    expectedCurrent?: Record<string, unknown>;
    ignoredExpectedFields?: readonly string[];
  } = {},
): Promise<void> {
  const account = await accountQueryRepository.find(workplaceId, accountId);
  if (!account) return;

  await accountWriteRepository.delete(
    workplaceId,
    account,
    {
      extraOps: (currentAccount, deletedAt) => [
        auditRepository.prepareLog(
          {
            entityType: 'account',
            entityId: currentAccount.id,
            eventType: 'account.deleted',
            revertsLogId: auditOptions.revertsLogId,
            action: AuditAction.DELETE,
            changes: {
              before: {
                name: currentAccount.name,
                deletedAt: currentAccount.deletedAt,
              },
              after: { deletedAt },
            },
          },
          workplaceId,
        ),
      ],
      validateCurrent: async (currentAccount, metadata) => {
        if (auditOptions.expectedCurrent) {
          assertAccountAuditSnapshot(
            currentAccount,
            metadata,
            auditOptions.expectedCurrent,
            auditOptions.ignoredExpectedFields,
          );
        }
        const blockers = await deleteBlockers(workplaceId, currentAccount.id);
        if (blockers.length > 0) {
          throw formatAccountDeleteBlockersError(currentAccount.name, blockers);
        }
      },
    },
  );

  analytics.trackFeatureUsage('account', 'delete', {
    account_type: account.accountType,
    has_transactions: await transactionQueryRepository.hasTransactions(workplaceId, account.id),
  });
}

export async function recoverAccount(
  accountId: AccountId,
  workplaceId: WorkplaceId,
  auditOptions: { revertsLogId?: string; expectedCurrent?: Record<string, unknown> } = {},
): Promise<void> {
  const account = await accountQueryRepository.findWithDeleted(workplaceId, accountId);
  if (!account) return;

  await accountWriteRepository.recover(
    workplaceId,
    account,
    {
      extraOps: (currentAccount, restoredAt) => [
        auditRepository.prepareLog(
          {
            entityType: 'account',
            entityId: accountId,
            eventType: 'account.restored',
            revertsLogId: auditOptions.revertsLogId,
            action: AuditAction.UPDATE,
            changes: {
              before: { deletedAt: currentAccount.deletedAt },
              after: { action: 'RECOVERED', deletedAt: undefined, restoredAt },
            },
          },
          workplaceId,
        ),
      ],
      validateCurrent: (currentAccount, metadata) => {
        if (auditOptions.expectedCurrent) {
          assertAccountAuditSnapshot(currentAccount, metadata, auditOptions.expectedCurrent);
        }
      },
    },
  );

  analytics.trackFeatureUsage('account', 'recover', {
    account_type: account.accountType,
  });
}
