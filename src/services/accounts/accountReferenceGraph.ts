/**
 * Account reference graph — owns which persisted fields reference Accounts
 * and the shared helpers for those refs (CSV funding lists, site enumeration).
 *
 * Policy ops (`assertWritable`, `deleteBlockers`, `importPlan`) deepen in later
 * tickets; this foundation publishes inventory + CSV + `referenceSites`.
 *
 * Complements ADR-0008: stays under account command modules; no AccountService.
 */

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
