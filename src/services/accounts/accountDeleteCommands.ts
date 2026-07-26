import Account from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import { database } from '@/src/data/database/Database';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { analytics } from '@/src/services/analytics-service';
import { auditService } from '@/src/services/audit-service';
import { AccountId, WorkplaceId } from '@/src/types/domain';

export async function deleteAccount(
  accountOrId: Account | AccountId,
  workplaceId: WorkplaceId,
): Promise<void> {
  const account =
    typeof accountOrId === 'string'
      ? await accountRepository.find(workplaceId, accountOrId)
      : accountOrId;
  if (!account) return;

  const hasTransactions = await transactionRepository.hasTransactions(workplaceId, account.id);
  if (hasTransactions) {
    throw new Error(
      `Account "${account.name}" has transactions and cannot be deleted. Merge transactions into another account first.`,
    );
  }

  await accountRepository.delete(workplaceId, account);

  await auditService.log(
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
  );

  analytics.trackFeatureUsage('account', 'delete', {
    account_type: account.accountType,
    has_transactions: await transactionRepository.hasTransactions(workplaceId, account.id),
  });
}

export async function recoverAccount(
  accountId: AccountId,
  workplaceId: WorkplaceId,
): Promise<void> {
  const account = await accountRepository.findWithDeleted(workplaceId, accountId);
  if (!account) return;

  await database.write(async () => {
    await account.update(record => {
      record.deletedAt = undefined;
      record.updatedAt = new Date();
    });
  });

  await auditService.log(
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
  );

  analytics.trackFeatureUsage('account', 'recover', {
    account_type: account.accountType,
  });
}
