/** Shared account-reference inventory and pure import rules; no persistence dependencies. */
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';

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

/**
 * Import policy for the site.
 * - salvage: missing ids become placeholder Accounts (`missingAccountIds`)
 * - sanitize: missing ids are cleared on rules (`rulePatches`); not salvaged
 */
export type AccountReferenceImportPolicy = 'salvage' | 'sanitize';

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
  importPolicy: AccountReferenceImportPolicy;
};

/** Narrow batch DTO for import planning / inventory-backed validate. */
export type AccountImportBatchDto = {
  /** Account ids in the batch — soft-deleted still count as present. */
  accountIds: readonly string[];
  /** Account FK occurrences from salvage sites (adapter walks inventory). */
  refs: readonly AccountImportRef[];
  /** SMS auto-post rules — sanitize path (not salvage). */
  rules: readonly AccountImportRuleRef[];
};

export type AccountImportRef = {
  siteKey: AccountReferenceSiteKey;
  accountId: string;
  /** Optional record id for validate error messages. */
  recordId?: string;
};

export type AccountImportRuleRef = {
  ruleKey: string;
  sourceAccountId?: string | null;
  categoryAccountId?: string | null;
};

export type ImportPlan = {
  missingAccountIds: string[];
  rulePatches: {
    ruleKey: string;
    sourceAccountId?: string;
    categoryAccountId?: string;
  }[];
};

export type MissingImportedAccountRef = {
  siteKey: AccountReferenceSiteKey;
  accountId: string;
  recordId?: string;
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
    importPolicy: 'salvage',
  },
  {
    key: 'transaction.accountId',
    table: 'transactions',
    field: 'accountId',
    column: 'account_id',
    cardinality: 'scalar',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
    importPolicy: 'salvage',
  },
  {
    key: 'budgetScope.accountId',
    table: 'budget_scopes',
    field: 'accountId',
    column: 'account_id',
    cardinality: 'scalar',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
    importPolicy: 'salvage',
  },
  {
    key: 'budget.assetAccountIds',
    table: 'budgets',
    field: 'assetAccountIds',
    column: 'asset_account_ids',
    cardinality: 'csv',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
    importPolicy: 'salvage',
  },
  {
    key: 'accountMetadata.accountId',
    table: 'account_metadata',
    field: 'accountId',
    column: 'account_id',
    cardinality: 'scalar',
    mergeBehavior: 'none',
    deletePolicy: 'owned',
    importPolicy: 'salvage',
  },
  {
    key: 'accountMetadata.payFromAccountId',
    table: 'account_metadata',
    field: 'payFromAccountId',
    column: 'pay_from_account_id',
    cardinality: 'scalar',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
    importPolicy: 'salvage',
  },
  {
    key: 'plannedPayment.fromAccountId',
    table: 'planned_payments',
    field: 'fromAccountId',
    column: 'from_account_id',
    cardinality: 'scalar',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
    importPolicy: 'salvage',
  },
  {
    key: 'plannedPayment.toAccountId',
    table: 'planned_payments',
    field: 'toAccountId',
    column: 'to_account_id',
    cardinality: 'scalar',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
    importPolicy: 'salvage',
  },
  {
    key: 'balanceSnapshot.accountId',
    table: 'balance_snapshots',
    field: 'accountId',
    column: 'account_id',
    cardinality: 'scalar',
    mergeBehavior: 'destroy',
    deletePolicy: 'allow',
    importPolicy: 'salvage',
  },
  {
    key: 'transactionAutoPostRule.sourceAccountId',
    table: 'transaction_auto_post_rules',
    field: 'sourceAccountId',
    column: 'source_account_id',
    cardinality: 'dual',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
    importPolicy: 'sanitize',
  },
  {
    key: 'transactionAutoPostRule.categoryAccountId',
    table: 'transaction_auto_post_rules',
    field: 'categoryAccountId',
    column: 'category_account_id',
    cardinality: 'dual',
    mergeBehavior: 'retarget',
    deletePolicy: 'block',
    importPolicy: 'sanitize',
  },
];

const SITES_BY_KEY: ReadonlyMap<AccountReferenceSiteKey, AccountReferenceSite> = new Map(
  ACCOUNT_REFERENCE_SITES.map(site => [site.key, site]),
);

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

function isNonEmptyAccountId(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Pure import plan: salvage missing non-rule Account refs; sanitize SMS rule
 * fields that remain missing after salvage. Soft-deleted batch accounts are
 * present (no placeholder). Adapter materializes placeholders + patches.
 */
export function importPlan(batch: AccountImportBatchDto): ImportPlan {
  const present = new Set(batch.accountIds.filter(isNonEmptyAccountId));
  const missing = new Set<string>();

  for (const ref of batch.refs) {
    if (!isNonEmptyAccountId(ref.accountId) || present.has(ref.accountId)) continue;
    const site = SITES_BY_KEY.get(ref.siteKey);
    if (!site || site.importPolicy !== 'salvage') continue;
    missing.add(ref.accountId);
  }

  const afterSalvage = new Set([...present, ...missing]);
  const rulePatches: ImportPlan['rulePatches'] = [];

  for (const rule of batch.rules) {
    const patch: ImportPlan['rulePatches'][number] = { ruleKey: rule.ruleKey };
    let needed = false;

    if (isNonEmptyAccountId(rule.sourceAccountId) && !afterSalvage.has(rule.sourceAccountId)) {
      patch.sourceAccountId = EMPTY_ACCOUNT_ID;
      needed = true;
    }
    if (isNonEmptyAccountId(rule.categoryAccountId) && !afterSalvage.has(rule.categoryAccountId)) {
      patch.categoryAccountId = EMPTY_ACCOUNT_ID;
      needed = true;
    }

    if (needed) rulePatches.push(patch);
  }

  return {
    missingAccountIds: [...missing],
    rulePatches,
  };
}

/**
 * Account FK occurrences in the batch that are not present. Used by import
 * validate as a thin inventory walk — empty rule legs are omitted by the adapter.
 */
export function missingImportedAccountRefs(
  batch: AccountImportBatchDto,
): MissingImportedAccountRef[] {
  const present = new Set(batch.accountIds.filter(isNonEmptyAccountId));
  const missing: MissingImportedAccountRef[] = [];

  for (const ref of batch.refs) {
    if (!isNonEmptyAccountId(ref.accountId) || present.has(ref.accountId)) continue;
    missing.push({
      siteKey: ref.siteKey,
      accountId: ref.accountId,
      recordId: ref.recordId,
    });
  }

  for (const rule of batch.rules) {
    if (isNonEmptyAccountId(rule.sourceAccountId) && !present.has(rule.sourceAccountId)) {
      missing.push({
        siteKey: 'transactionAutoPostRule.sourceAccountId',
        accountId: rule.sourceAccountId,
        recordId: rule.ruleKey,
      });
    }
    if (isNonEmptyAccountId(rule.categoryAccountId) && !present.has(rule.categoryAccountId)) {
      missing.push({
        siteKey: 'transactionAutoPostRule.categoryAccountId',
        accountId: rule.categoryAccountId,
        recordId: rule.ruleKey,
      });
    }
  }

  return missing;
}
