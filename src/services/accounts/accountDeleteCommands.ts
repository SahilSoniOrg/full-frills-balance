import { AuditAction, AccountId, WorkplaceId } from '@/src/types/domain';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { deleteBlockers, type DeleteBlocker } from '@/src/services/accounts/accountReferenceGraph';
import { analytics } from '@/src/services/analytics-service';

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

export async function deleteAccount(accountId: AccountId, workplaceId: WorkplaceId): Promise<void> {
  const account = await accountQueryRepository.find(workplaceId, accountId);
  if (!account) return;

  const blockers = await deleteBlockers(workplaceId, account.id);
  if (blockers.length > 0) {
    throw formatAccountDeleteBlockersError(account.name, blockers);
  }

  await accountWriteRepository.delete(workplaceId, account, () => [
    auditRepository.prepareLog(
      {
        entityType: 'account',
        entityId: account.id,
        action: AuditAction.DELETE,
        changes: {
          before: {
            name: account.name,
            deletedAt: account.deletedAt,
          },
          after: {
            deletedAt: new Date(),
          },
        },
      },
      workplaceId,
    ),
  ]);

  analytics.trackFeatureUsage('account', 'delete', {
    account_type: account.accountType,
    has_transactions: await transactionQueryRepository.hasTransactions(workplaceId, account.id),
  });
}

export async function recoverAccount(
  accountId: AccountId,
  workplaceId: WorkplaceId,
): Promise<void> {
  const account = await accountQueryRepository.findWithDeleted(workplaceId, accountId);
  if (!account) return;

  await accountWriteRepository.recover(workplaceId, account, () => [
    auditRepository.prepareLog(
      {
        entityType: 'account',
        entityId: accountId,
        action: AuditAction.UPDATE,
        changes: {
          before: { deletedAt: account.deletedAt },
          after: { action: 'RECOVERED', deletedAt: undefined },
        },
      },
      workplaceId,
    ),
  ]);

  analytics.trackFeatureUsage('account', 'recover', {
    account_type: account.accountType,
  });
}
