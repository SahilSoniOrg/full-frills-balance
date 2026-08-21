import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { analytics } from '@/src/services/analytics';
import { AccountId, AuditAction, WorkplaceId } from '@/src/types/domain';

export async function reconcileAccount(accountId: AccountId, date: Date, workplaceId: WorkplaceId) {
  const account = await accountQueryRepository.find(workplaceId, accountId);
  if (!account) throw new Error('Account not found');

  const updatedAccount = await accountWriteRepository.update(
    account,
    { reconciledAt: date },
    workplaceId,
    () => [
      auditRepository.prepareLog(
        {
          entityType: 'account',
          entityId: accountId,
          action: AuditAction.UPDATE,
          changes: { reconciledAt: date },
        },
        workplaceId,
      ),
    ],
  );

  analytics.trackFeatureUsage('account', 'reconcile', {
    account_type: account.accountType,
    reconcile_date: date.toISOString(),
  });

  return updatedAccount;
}
