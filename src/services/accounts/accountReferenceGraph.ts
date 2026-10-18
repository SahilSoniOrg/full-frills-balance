/**
 * Account reference graph — owns which persisted fields reference Accounts
 * and the policies for those refs (write assert, delete block, CSV funding lists,
 * import salvage/sanitize planning, site enumeration for merge).
 *
 * Complements ADR-0008: stays under account command modules; no AccountService.
 */

import Account from '@/src/data/models/Account';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { parseFundingAccountIds, type DeleteBlocker } from './accountReferencePolicy';

export * from './accountReferencePolicy';

/**
 * Fail-hard write guard: every non-empty id must resolve to a live Account in
 * the workplace. Soft-deleted Accounts do not count. Returns resolved Accounts
 * so callers can avoid a second fetch (e.g. parent type checks).
 */
export async function assertWritable(
  workplaceId: WorkplaceId,
  accountIds: (AccountId | string | null | undefined)[],
  context = 'Operation',
): Promise<Account[]> {
  const unique = [
    ...new Set(accountIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ];
  if (unique.length === 0) return [];

  const accounts = await accountQueryRepository.findAllByIds(workplaceId, unique as AccountId[]);
  const found = new Set(accounts.map(account => account.id as string));
  const missing = unique.filter(id => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`${context} references missing or deleted account(s): ${missing.join(', ')}`);
  }
  return accounts;
}

/**
 * Reasons an Account cannot be soft-deleted without leaving orphan FKs.
 * Empty array means delete is safe from a reference standpoint.
 * Balance snapshots are allow-delete (rebuildable cache) and never appear here.
 */
export async function deleteBlockers(
  workplaceId: WorkplaceId,
  accountId: AccountId,
): Promise<DeleteBlocker[]> {
  const [
    transactions,
    children,
    scopes,
    assetBudgetCandidates,
    fromPayments,
    toPayments,
    payFromMetadata,
    smsRules,
  ] = await Promise.all([
    transactionQueryRepository.findAllByAccountIds(workplaceId, [accountId]),
    accountQueryRepository.queryByParentId(workplaceId, accountId).fetch(),
    budgetRepository.findAllScopesByAccountIds(workplaceId, [accountId]),
    budgetRepository.findAllReferencingAssetAccountId(workplaceId, accountId),
    plannedPaymentRepository.findAllByFromAccountIds(workplaceId, [accountId]),
    plannedPaymentRepository.findAllByToAccountIds(workplaceId, [accountId]),
    accountQueryRepository.findMetadataByPayFromAccountIds(workplaceId, [accountId]),
    transactionAutoPostRuleRepository.findAllReferencingAccountIds(workplaceId, [accountId]),
  ]);

  const assetBudgetHits = assetBudgetCandidates.filter(budget =>
    parseFundingAccountIds(budget.assetAccountIds).includes(accountId),
  );

  const plannedPaymentIds = new Set([...fromPayments, ...toPayments].map(payment => payment.id));

  const blockers: DeleteBlocker[] = [];
  if (transactions.length > 0) {
    blockers.push({
      code: 'transactions',
      count: transactions.length,
      label: 'transaction(s)',
    });
  }
  if (children.length > 0) {
    blockers.push({
      code: 'child_accounts',
      count: children.length,
      label: 'child account(s)',
    });
  }
  if (scopes.length > 0) {
    blockers.push({
      code: 'budget_scopes',
      count: scopes.length,
      label: 'budget scope(s)',
    });
  }
  if (assetBudgetHits.length > 0) {
    blockers.push({
      code: 'budget_funding_accounts',
      count: assetBudgetHits.length,
      label: 'budget funding account list(s)',
    });
  }
  if (plannedPaymentIds.size > 0) {
    blockers.push({
      code: 'planned_payments',
      count: plannedPaymentIds.size,
      label: 'planned payment(s)',
    });
  }
  if (payFromMetadata.length > 0) {
    blockers.push({
      code: 'pay_from_metadata',
      count: payFromMetadata.length,
      label: 'pay-from metadata reference(s)',
    });
  }
  if (smsRules.length > 0) {
    blockers.push({
      code: 'sms_auto_post_rules',
      count: smsRules.length,
      label: 'SMS auto-post rule(s)',
    });
  }

  return blockers;
}

/**
 * Post-merge invariant: a soft-deleted source account must have no live
 * references in any account-owned site. Rebuildable balance snapshots are
 * intentionally excluded because they are not delete blockers.
 */
export async function assertNoLiveAccountReferences(
  workplaceId: WorkplaceId,
  accountIds: AccountId[],
): Promise<void> {
  const violations = await Promise.all(
    [...new Set(accountIds)].map(async accountId => ({
      accountId,
      blockers: await deleteBlockers(workplaceId, accountId),
    })),
  );

  const remaining = violations.filter(({ blockers }) => blockers.length > 0);
  if (remaining.length === 0) return;

  const details = remaining
    .map(
      ({ accountId, blockers }) =>
        `${accountId}: ${blockers.map(blocker => blocker.code).join(', ')}`,
    )
    .join('; ');
  throw new Error(`Account merge left live references to source account(s): ${details}`);
}
