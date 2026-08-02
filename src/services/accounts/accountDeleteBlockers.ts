import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { AccountId, WorkplaceId } from '@/src/types/domain';

/**
 * Reasons an account cannot be soft-deleted without leaving orphan FKs.
 * Empty array means delete is safe from a reference standpoint.
 */
export async function collectAccountDeleteBlockers(
  workplaceId: WorkplaceId,
  accountId: AccountId,
): Promise<string[]> {
  const [
    children,
    scopes,
    assetBudgetCandidates,
    fromPayments,
    toPayments,
    payFromMetadata,
    smsRules,
  ] = await Promise.all([
    accountRepository.queryByParentId(workplaceId, accountId).fetch(),
    budgetRepository.findAllScopesByAccountIds(workplaceId, [accountId]),
    budgetRepository.findAllReferencingAssetAccountId(workplaceId, accountId),
    plannedPaymentRepository.findAllByFromAccountIds(workplaceId, [accountId]),
    plannedPaymentRepository.findAllByToAccountIds(workplaceId, [accountId]),
    accountRepository.findMetadataByPayFromAccountIds(workplaceId, [accountId]),
    transactionAutoPostRuleRepository.findAllReferencingAccountIds(workplaceId, [accountId]),
  ]);

  const assetBudgetHits = assetBudgetCandidates.filter(budget =>
    (budget.assetAccountIds || '')
      .split(',')
      .map(id => id.trim())
      .includes(accountId),
  );

  const blockers: string[] = [];
  if (children.length > 0) blockers.push(`${children.length} child account(s)`);
  if (scopes.length > 0) blockers.push(`${scopes.length} budget scope(s)`);
  if (assetBudgetHits.length > 0) {
    blockers.push(`${assetBudgetHits.length} budget funding account list(s)`);
  }
  const plannedPaymentIds = new Set([...fromPayments, ...toPayments].map(payment => payment.id));
  if (plannedPaymentIds.size > 0) {
    blockers.push(`${plannedPaymentIds.size} planned payment(s)`);
  }
  if (payFromMetadata.length > 0) {
    blockers.push(`${payFromMetadata.length} pay-from metadata reference(s)`);
  }
  if (smsRules.length > 0) blockers.push(`${smsRules.length} SMS auto-post rule(s)`);

  return blockers;
}
