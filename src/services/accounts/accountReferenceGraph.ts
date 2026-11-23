/**
 * Account reference graph — owns which persisted fields reference Accounts
 * and the policies for those refs (write assert, delete block, CSV funding lists,
 * import salvage/sanitize planning, site enumeration for merge).
 *
 * Complements ADR-0008: stays under account command modules; no AccountService.
 */

import Account from '@/src/data/models/Account';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { accountMatcherRepository } from '@/src/data/repositories/AccountMatcherRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { AccountId, WorkplaceId } from '@/src/types/ids';

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
 * - sanitize: missing ids are cleared by the importer; not salvaged
 * - reject: missing ids remain validation errors and must be dropped by the importer
 */
export type AccountReferenceImportPolicy = 'salvage' | 'sanitize' | 'reject';

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
  | 'accountMatcher.accountId';

export type AccountImportRef = {
  siteKey: AccountReferenceSiteKey;
  accountId: string;
  /** Optional record id for validate error messages. */
  recordId?: string;
};

export type MissingImportedAccountRef = {
  siteKey: AccountReferenceSiteKey;
  accountId: string;
  recordId?: string;
};

/** Structural import bag for registry-driven FK extraction (Canonical* assignable). */
export type AccountImportSourceBag = {
  accounts: readonly { id: string; parentAccountId?: string | null }[];
  transactions: readonly {
    id: string;
    accountId: string;
    deletedAt?: number | null;
  }[];
  budgetScopes?: readonly { id: string; accountId: string }[];
  budgets?: readonly { id: string; assetAccountIds?: string | null }[];
  accountMetadata?: readonly {
    id: string;
    accountId: string;
    payFromAccountId?: string | null;
  }[];
  plannedPayments?: readonly {
    id: string;
    fromAccountId: string;
    toAccountId?: string | null;
  }[];
  balanceSnapshots?: readonly { id: string; accountId: string }[];
  accountMatchers?: readonly { id: string; accountId: string }[];
};

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
  /** Walk the import bag for this site's Account FK occurrences. */
  extractImportRefs: (data: AccountImportSourceBag) => AccountImportRef[];
  /** User-facing validate error when this site's FK is missing. */
  formatMissingImportError: (missing: MissingImportedAccountRef) => string;
};

/** Narrow batch DTO for import planning / inventory-backed validate. */
export type AccountImportBatchDto = {
  /** Account ids in the batch — soft-deleted still count as present. */
  accountIds: readonly string[];
  /** Account FK occurrences from salvage/reject sites (adapter walks inventory). */
  refs: readonly AccountImportRef[];
};

export type ImportPlan = {
  missingAccountIds: string[];
};

function importRef(
  siteKey: AccountReferenceSiteKey,
  accountId: string | null | undefined,
  recordId?: string,
): AccountImportRef | null {
  if (typeof accountId !== 'string' || accountId.length === 0) return null;
  return { siteKey, accountId, recordId };
}

function collectScalarRefs<T extends { id: string }>(
  siteKey: AccountReferenceSiteKey,
  rows: readonly T[],
  accountIdOf: (row: T) => string | null | undefined,
): AccountImportRef[] {
  const refs: AccountImportRef[] = [];
  for (const row of rows) {
    const ref = importRef(siteKey, accountIdOf(row), row.id);
    if (ref) refs.push(ref);
  }
  return refs;
}

function missingImportError(
  noun: string,
  missing: MissingImportedAccountRef,
  accountNoun = 'account',
): string {
  const recordId = missing.recordId ?? '?';
  return `Import validation failed: ${noun} "${recordId}" references missing ${accountNoun} "${missing.accountId}"`;
}

export type DeleteBlockerCode =
  | 'transactions'
  | 'child_accounts'
  | 'budget_scopes'
  | 'budget_funding_accounts'
  | 'planned_payments'
  | 'pay_from_metadata';

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
    extractImportRefs: data =>
      collectScalarRefs('account.parentAccountId', data.accounts, row => row.parentAccountId),
    formatMissingImportError: missing => missingImportError('account', missing, 'parent account'),
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
    extractImportRefs: data =>
      collectScalarRefs(
        'transaction.accountId',
        data.transactions.filter(tx => tx.deletedAt == null),
        row => row.accountId,
      ),
    formatMissingImportError: missing => missingImportError('transaction', missing),
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
    extractImportRefs: data =>
      collectScalarRefs('budgetScope.accountId', data.budgetScopes || [], row => row.accountId),
    formatMissingImportError: missing => missingImportError('budget scope', missing),
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
    extractImportRefs: data => {
      const refs: AccountImportRef[] = [];
      for (const budget of data.budgets || []) {
        for (const id of parseFundingAccountIds(budget.assetAccountIds)) {
          const ref = importRef('budget.assetAccountIds', id, budget.id);
          if (ref) refs.push(ref);
        }
      }
      return refs;
    },
    formatMissingImportError: missing => missingImportError('budget', missing, 'asset account'),
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
    extractImportRefs: data =>
      collectScalarRefs(
        'accountMetadata.accountId',
        data.accountMetadata || [],
        row => row.accountId,
      ),
    formatMissingImportError: missing => missingImportError('account metadata', missing),
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
    extractImportRefs: data =>
      collectScalarRefs(
        'accountMetadata.payFromAccountId',
        data.accountMetadata || [],
        row => row.payFromAccountId,
      ),
    formatMissingImportError: missing =>
      missingImportError('account metadata', missing, 'payment account'),
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
    extractImportRefs: data =>
      collectScalarRefs(
        'plannedPayment.fromAccountId',
        data.plannedPayments || [],
        row => row.fromAccountId,
      ),
    formatMissingImportError: missing => {
      const recordId = missing.recordId ?? '?';
      return `Import validation failed: planned payment "${recordId}" references a missing account`;
    },
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
    extractImportRefs: data =>
      collectScalarRefs(
        'plannedPayment.toAccountId',
        data.plannedPayments || [],
        row => row.toAccountId,
      ),
    formatMissingImportError: missing => {
      const recordId = missing.recordId ?? '?';
      return `Import validation failed: planned payment "${recordId}" references a missing account`;
    },
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
    extractImportRefs: data =>
      collectScalarRefs(
        'balanceSnapshot.accountId',
        data.balanceSnapshots || [],
        row => row.accountId,
      ),
    formatMissingImportError: missing => {
      const recordId = missing.recordId ?? '?';
      return `Import validation failed: balance snapshot "${recordId}" references a missing account or transaction`;
    },
  },
  {
    key: 'accountMatcher.accountId',
    table: 'account_matchers',
    field: 'accountId',
    column: 'account_id',
    cardinality: 'scalar',
    mergeBehavior: 'retarget',
    deletePolicy: 'owned',
    importPolicy: 'reject',
    extractImportRefs: data =>
      collectScalarRefs(
        'accountMatcher.accountId',
        data.accountMatchers || [],
        row => row.accountId,
      ),
    formatMissingImportError: missing =>
      `Import validation failed: missing account "${missing.accountId}"`,
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

/** Collect Account FK refs via each site's extractor (skips sanitize-only sites). */
export function collectImportAccountRefs(data: AccountImportSourceBag): AccountImportRef[] {
  const refs: AccountImportRef[] = [];
  for (const site of ACCOUNT_REFERENCE_SITES) {
    if (site.importPolicy === 'sanitize') continue;
    refs.push(...site.extractImportRefs(data));
  }
  return refs;
}

/** Validate error text from the site registry (no siteKey switch at call sites). */
export function formatMissingImportedAccountError(missing: MissingImportedAccountRef): string {
  const site = SITES_BY_KEY.get(missing.siteKey);
  if (site) return site.formatMissingImportError(missing);
  return `Import validation failed: missing account "${missing.accountId}"`;
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

/** Pure import plan for missing Account references. */
export function importPlan(batch: AccountImportBatchDto): ImportPlan {
  const present = new Set(batch.accountIds.filter(isNonEmptyAccountId));
  const missing = new Set<string>();

  for (const ref of batch.refs) {
    if (!isNonEmptyAccountId(ref.accountId) || present.has(ref.accountId)) continue;
    const site = SITES_BY_KEY.get(ref.siteKey);
    if (!site || site.importPolicy !== 'salvage') continue;
    missing.add(ref.accountId);
  }

  return { missingAccountIds: [...missing] };
}

/**
 * Account FK occurrences in the batch that are not present.
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

  return missing;
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
  ] = await Promise.all([
    transactionQueryRepository.findAllByAccountIds(workplaceId, [accountId]),
    accountQueryRepository.queryByParentId(workplaceId, accountId).fetch(),
    budgetRepository.findAllScopesByAccountIds(workplaceId, [accountId]),
    budgetRepository.findAllReferencingAssetAccountId(workplaceId, accountId),
    plannedPaymentRepository.findAllByFromAccountIds(workplaceId, [accountId]),
    plannedPaymentRepository.findAllByToAccountIds(workplaceId, [accountId]),
    accountQueryRepository.findMetadataByPayFromAccountIds(workplaceId, [accountId]),
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
    [...new Set(accountIds)].map(async accountId => {
      const [blockers, matchers] = await Promise.all([
        deleteBlockers(workplaceId, accountId),
        accountMatcherRepository.findAllByAccountIds(workplaceId, [accountId]),
      ]);
      return { accountId, blockers, matcherCount: matchers.length };
    }),
  );

  const remaining = violations.filter(
    ({ blockers, matcherCount }) => blockers.length > 0 || matcherCount > 0,
  );
  if (remaining.length === 0) return;

  const details = remaining
    .map(
      ({ accountId, blockers, matcherCount }) =>
        `${accountId}: ${[
          ...blockers.map(blocker => blocker.code),
          ...(matcherCount > 0 ? ['account_matchers'] : []),
        ].join(', ')}`,
    )
    .join('; ');
  throw new Error(`Account merge left live references to source account(s): ${details}`);
}
