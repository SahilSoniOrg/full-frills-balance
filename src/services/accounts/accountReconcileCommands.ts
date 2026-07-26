import { AuditAction } from '@/src/data/models/AuditLog';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { analytics } from '@/src/services/analytics-service';
import { auditService } from '@/src/services/audit-service';
import { AccountId, WorkplaceId } from '@/src/types/domain';

export async function reconcileAccount(accountId: AccountId, date: Date, workplaceId: WorkplaceId) {
  const account = await accountRepository.find(workplaceId, accountId);
  if (!account) throw new Error('Account not found');

  const updatedAccount = await accountRepository.update(
    account,
    { reconciledAt: date },
    workplaceId,
  );

  await auditService.log(
    {
      entityType: 'account',
      entityId: accountId,
      action: AuditAction.UPDATE,
      changes: { reconciledAt: date },
    },
    workplaceId,
  );

  analytics.trackFeatureUsage('account', 'reconcile', {
    account_type: account.accountType,
    reconcile_date: date.toISOString(),
  });

  return updatedAccount;
}
