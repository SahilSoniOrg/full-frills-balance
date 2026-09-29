import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { analytics } from '@/src/services/analytics';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AuditAction } from '@/src/types/enums';

export async function reconcileAccount(accountId: AccountId, date: Date, workplaceId: WorkplaceId) {
  const account = await accountQueryRepository.find(workplaceId, accountId);
  if (!account) throw new Error('Account not found');

  const mutation = await accountWriteRepository.update(
    account,
    { reconciledAt: date },
    workplaceId,
    {
      audit: {
        action: AuditAction.UPDATE,
        eventType: 'account.reconciled',
        changes: {
          before: { reconciledAt: account.reconciledAt ?? null },
          after: { reconciledAt: date },
        },
      },
    },
  );

  analytics.trackFeatureUsage('account', 'reconcile', {
    account_type: account.accountType,
    reconcile_date: date.toISOString(),
  });

  return mutation.account;
}
