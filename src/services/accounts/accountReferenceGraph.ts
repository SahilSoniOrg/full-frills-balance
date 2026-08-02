/**
 * Account reference graph — owns which persisted fields reference Accounts
 * and the policies for those refs (write assert, delete block, CSV funding lists,
 * site enumeration). Import plan / merge iteration deepen in later tickets.
 *
 * Complements ADR-0008: stays under account command modules; no AccountService.
 */

import Account from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountId, WorkplaceId } from '@/src/types/domain';

export type AccountReferenceCardinality = 'scalar' | 'csv' | 'dual';

/** How merge should treat the site when iterating `referenceSites` (v1 enum). */
export type AccountReferenceMergeBehavior = 'retarget' | 'destroy' | 'none';

/**
 * Whether soft-delete is blocked by live refs at this site.
 * - block: counts toward delete blockers
 * - allow: present but does not block (rebuildable cache)
 * - owned: row belongs to the account being deleted (not a blocker)
 */
export type AccountReferenceDeletePolicy = 'block' | 'allow' | 'owned';

export type AccountReferenceSiteKey =
  | 'account.parentAccountId'
  | 'transaction.accountId'
  | 'budgetScope.accountId'
  | 'budget.assetAccountIds'
  | 'accountMetadata.accountId'
  | 'accountMetadata.payFromAccountId'
  | 'plannedPayment.fromAccountId'
  | 'plannedPayment.toAccountId'
  | 'balanceSnapshot.accountId'
  | 'transactionAutoPostRule.sourceAccountId'
  | 'transactionAutoPostRule.categoryAccountId';

export type AccountReferenceSite = {
  key: AccountReferenceSiteKey;
  /** Watermelon table name */
  table: string;
  /** Model field name */
  field: string;
  /** Schema column name */
  column: string;
  cardinality: AccountReferenceCardinality;
  mergeBehavior: AccountReferenceMergeBehavior;
  deletePolicy: AccountReferenceDeletePolicy;
};

export type DeleteBlockerCode =
  | 'transactions'
  | 'child_accounts'
  | 'budget_scopes'
  | 'budget_funding_accounts'
  | 'planned_payments'
  | 'pay_from_metadata'
  | 'sms_auto_post_rules';

/** Structured delete gate; commands format the user-facing Error. */
export type DeleteBlocker = {
  code: DeleteBlockerCode;
  count: number;
  /** Short English noun phrase for command interpolation (not a full sentence). */
  label: string;
};

const ACCOUNT_REFERENCE_SITES: readonly AccountReferenceSite[] = [
  {
    key: 'account.parentAccountId',
    table: 'accounts',
    field: 'parentAccountId',
    column: 'parent_account_id',
    cardinality: 'scalar',
    mergeBehavior: 'retarget',
    deletePolicy: 'block', // delete walks children via parent FK
  },
  {
    key: 'transaction.accountId',
    table: 'transactions',
    field: 'accountId',
    column: 'account_id',
    cardinality: 'scalar',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
  },
  {
    key: 'budgetScope.accountId',
    table: 'budget_scopes',
    field: 'accountId',
    column: 'account_id',
    cardinality: 'scalar',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
  },
  {
    key: 'budget.assetAccountIds',
    table: 'budgets',
    field: 'assetAccountIds',
    column: 'asset_account_ids',
    cardinality: 'csv',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
  },
  {
    key: 'accountMetadata.accountId',
    table: 'account_metadata',
    field: 'accountId',
    column: 'account_id',
    cardinality: 'scalar',
    mergeBehavior: 'none',
    deletePolicy: 'owned',
  },
  {
    key: 'accountMetadata.payFromAccountId',
    table: 'account_metadata',
    field: 'payFromAccountId',
    column: 'pay_from_account_id',
    cardinality: 'scalar',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
  },
  {
    key: 'plannedPayment.fromAccountId',
    table: 'planned_payments',
    field: 'fromAccountId',
    column: 'from_account_id',
    cardinality: 'scalar',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
  },
  {
    key: 'plannedPayment.toAccountId',
    table: 'planned_payments',
    field: 'toAccountId',
    column: 'to_account_id',
    cardinality: 'scalar',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
  },
  {
    key: 'balanceSnapshot.accountId',
    table: 'balance_snapshots',
    field: 'accountId',
    column: 'account_id',
    cardinality: 'scalar',
    mergeBehavior: 'destroy',
    deletePolicy: 'allow',
  },
  {
    key: 'transactionAutoPostRule.sourceAccountId',
    table: 'transaction_auto_post_rules',
    field: 'sourceAccountId',
    column: 'source_account_id',
    cardinality: 'dual',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
  },
  {
    key: 'transactionAutoPostRule.categoryAccountId',
    table: 'transaction_auto_post_rules',
    field: 'categoryAccountId',
    column: 'category_account_id',
    cardinality: 'dual',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
  },
];

/**
 * Site list for merge/tests. Registry stays behind this interface — callers
 * should not treat the const array as the primary import.
 */
export function referenceSites(): readonly AccountReferenceSite[] {
  return ACCOUNT_REFERENCE_SITES;
}

/** Split/trim funding `assetAccountIds` CSV; drops empty tokens. */
export function parseFundingAccountIds(csv: string | null | undefined): string[] {
  if (csv == null || csv.length === 0) return [];
  return csv
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

/** Join funding Account ids into the persisted CSV form. */
export function formatFundingAccountIds(ids: readonly string[]): string {
  return ids.join(',');
}

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

  const accounts = await accountRepository.findAllByIds(workplaceId, unique as AccountId[]);
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
    transactionRepository.findAllByAccountIds(workplaceId, [accountId]),
    accountRepository.queryByParentId(workplaceId, accountId).fetch(),
    budgetRepository.findAllScopesByAccountIds(workplaceId, [accountId]),
    budgetRepository.findAllReferencingAssetAccountId(workplaceId, accountId),
    plannedPaymentRepository.findAllByFromAccountIds(workplaceId, [accountId]),
    plannedPaymentRepository.findAllByToAccountIds(workplaceId, [accountId]),
    accountRepository.findMetadataByPayFromAccountIds(workplaceId, [accountId]),
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
